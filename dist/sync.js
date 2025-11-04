"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncManager = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const opencode_1 = require("./opencode");
const utils_1 = require("./utils");
class SyncManager {
    constructor(opencodePath, syncPath) {
        this.opencodeStorage = new opencode_1.OpenCodeStorage(opencodePath);
        this.syncPath = syncPath;
        this.conversationsPath = (0, path_1.join)(syncPath, 'conversations');
    }
    async check() {
        const localConversations = await this.opencodeStorage.getConversations();
        const syncConversations = await this.getSyncConversations();
        const result = {
            needsPush: [],
            needsPull: [],
            upToDate: []
        };
        // Check all conversations from both sources
        const allConversationIds = new Set([
            ...localConversations.keys(),
            ...syncConversations.keys()
        ]);
        for (const convId of allConversationIds) {
            const localUpdated = localConversations.get(convId) || 0;
            const syncUpdated = syncConversations.get(convId) || 0;
            if (localUpdated > syncUpdated) {
                result.needsPush.push(convId);
            }
            else if (syncUpdated > localUpdated) {
                result.needsPull.push(convId);
            }
            else if (localUpdated > 0) {
                result.upToDate.push(convId);
            }
        }
        return result;
    }
    async push() {
        const result = await this.check();
        if (result.needsPush.length === 0) {
            console.log('No conversations need to be pushed.');
            return;
        }
        console.log(`Pushing ${result.needsPush.length} conversation(s)...`);
        await (0, utils_1.ensureDir)(this.conversationsPath);
        for (const convId of result.needsPush) {
            const conversation = await this.opencodeStorage.getConversationData(convId);
            if (conversation) {
                const syncFile = (0, path_1.join)(this.conversationsPath, `${convId}.json`);
                await (0, utils_1.writeJsonFile)(syncFile, conversation);
                console.log(`  ✓ Pushed: ${convId} (${conversation.metadata.title})`);
            }
        }
        console.log('Push completed successfully.');
    }
    async pull() {
        const result = await this.check();
        if (result.needsPull.length === 0) {
            console.log('No conversations need to be pulled.');
            return;
        }
        console.log(`Pulling ${result.needsPull.length} conversation(s)...`);
        for (const convId of result.needsPull) {
            const syncFile = (0, path_1.join)(this.conversationsPath, `${convId}.json`);
            try {
                const conversation = await (0, utils_1.readJsonFile)(syncFile);
                await this.importConversation(conversation);
                console.log(`  ✓ Pulled: ${convId} (${conversation.metadata.title})`);
            }
            catch (error) {
                console.error(`  ✗ Failed to pull ${convId}:`, error);
            }
        }
        console.log('Pull completed successfully.');
    }
    async getSyncConversations() {
        const conversations = new Map();
        try {
            await fs_1.promises.access(this.conversationsPath);
            const files = await fs_1.promises.readdir(this.conversationsPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const convId = file.replace('.json', '');
                    const filePath = (0, path_1.join)(this.conversationsPath, file);
                    try {
                        const conversation = await (0, utils_1.readJsonFile)(filePath);
                        conversations.set(convId, conversation.metadata.updated);
                    }
                    catch (error) {
                        console.warn(`Warning: Could not read sync file ${file}:`, error);
                    }
                }
            }
        }
        catch (error) {
            // Sync directory doesn't exist yet
        }
        return conversations;
    }
    async importConversation(conversation) {
        // This is a simplified import - in a real implementation, we'd need to
        // properly integrate with OpenCode's storage format
        // For now, we'll just copy the data to the local storage
        const opencodePath = this.opencodeStorage.constructor.toString().includes('OpenCodeStorage')
            ? this.opencodeStorage.storagePath
            : process.env.OPENCODE_STORAGE_DIR;
        if (!opencodePath) {
            throw new Error('OpenCode storage path not available');
        }
        // Create a simple import marker file (simplified approach)
        const importMarker = (0, path_1.join)(opencodePath, 'sync_imported', `${conversation.id}.json`);
        await (0, utils_1.ensureDir)((0, path_1.join)(opencodePath, 'sync_imported'));
        await (0, utils_1.writeJsonFile)(importMarker, conversation);
        console.log(`  Imported conversation ${conversation.id} to local storage`);
    }
    // Static method for generic directory-to-directory sync
    static async syncDirectories(path1, path2) {
        // Create sync instances for both directions
        const sync1to2 = new DirectorySync(path1, path2);
        const sync2to1 = new DirectorySync(path2, path1);
        // Check both directions
        const result1to2 = await sync1to2.check();
        const result2to1 = await sync2to1.check();
        if (result1to2.needsPush.length === 0 && result2to1.needsPush.length === 0) {
            console.log('No conversations need to be synced.');
            return;
        }
        // Perform bidirectional sync
        if (result1to2.needsPush.length > 0) {
            console.log(`Pushing ${result1to2.needsPush.length} conversation(s) from ${path1} to ${path2}...`);
            await sync1to2.push();
        }
        if (result2to1.needsPush.length > 0) {
            console.log(`Pushing ${result2to1.needsPush.length} conversation(s) from ${path2} to ${path1}...`);
            await sync2to1.push();
        }
        console.log('Directory sync completed successfully.');
    }
}
exports.SyncManager = SyncManager;
// Helper class for generic directory-to-directory sync
class DirectorySync {
    constructor(sourcePath, targetPath) {
        this.sourcePath = sourcePath;
        this.targetPath = targetPath;
    }
    async check() {
        const result = {
            needsPush: [],
            needsPull: [],
            upToDate: []
        };
        try {
            // Get conversations from source directory
            const sourceConversations = await this.getDirectoryConversations(this.sourcePath);
            const targetConversations = await this.getDirectoryConversations(this.targetPath);
            // Check all conversations from both sources
            const allConversationIds = new Set([
                ...sourceConversations.keys(),
                ...targetConversations.keys()
            ]);
            for (const convId of allConversationIds) {
                const sourceUpdated = sourceConversations.get(convId) || 0;
                const targetUpdated = targetConversations.get(convId) || 0;
                if (sourceUpdated > targetUpdated) {
                    result.needsPush.push(convId);
                }
                else if (targetUpdated > sourceUpdated) {
                    result.needsPull.push(convId);
                }
                else if (sourceUpdated > 0) {
                    result.upToDate.push(convId);
                }
            }
        }
        catch (error) {
            console.warn('Warning: Could not check directory sync:', error);
        }
        return result;
    }
    async push() {
        const result = await this.check();
        if (result.needsPush.length === 0) {
            return;
        }
        await (0, utils_1.ensureDir)((0, path_1.join)(this.targetPath, 'conversations'));
        for (const convId of result.needsPush) {
            const sourceFile = (0, path_1.join)(this.sourcePath, 'conversations', `${convId}.json`);
            const targetFile = (0, path_1.join)(this.targetPath, 'conversations', `${convId}.json`);
            try {
                const conversation = await (0, utils_1.readJsonFile)(sourceFile);
                await (0, utils_1.writeJsonFile)(targetFile, conversation);
                console.log(`  ✓ Pushed: ${convId} (${conversation.metadata.title})`);
            }
            catch (error) {
                console.error(`  ✗ Failed to push ${convId}:`, error);
            }
        }
    }
    async getDirectoryConversations(dirPath) {
        const conversations = new Map();
        try {
            const conversationsPath = (0, path_1.join)(dirPath, 'conversations');
            await fs_1.promises.access(conversationsPath);
            const files = await fs_1.promises.readdir(conversationsPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const convId = file.replace('.json', '');
                    const filePath = (0, path_1.join)(conversationsPath, file);
                    try {
                        const conversation = await (0, utils_1.readJsonFile)(filePath);
                        conversations.set(convId, conversation.metadata.updated);
                    }
                    catch (error) {
                        console.warn(`Warning: Could not read conversation file ${file}:`, error);
                    }
                }
            }
        }
        catch (error) {
            // Directory doesn't exist or is not accessible, return empty map
        }
        return conversations;
    }
}
//# sourceMappingURL=sync.js.map
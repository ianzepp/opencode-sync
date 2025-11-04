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
}
exports.SyncManager = SyncManager;
//# sourceMappingURL=sync.js.map
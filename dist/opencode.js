"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenCodeStorage = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const utils_1 = require("./utils");
class OpenCodeStorage {
    constructor(storagePath) {
        this.storagePath = storagePath;
    }
    async getConversations() {
        const conversations = new Map();
        try {
            // Scan session directories
            const sessionDir = (0, path_1.join)(this.storagePath, 'session');
            const projectDirs = await fs_1.promises.readdir(sessionDir);
            for (const projectDir of projectDirs) {
                const projectPath = (0, path_1.join)(sessionDir, projectDir);
                const stat = await fs_1.promises.stat(projectPath);
                if (stat.isDirectory()) {
                    const sessionFiles = await fs_1.promises.readdir(projectPath);
                    for (const sessionFile of sessionFiles) {
                        if (sessionFile.endsWith('.json')) {
                            const sessionId = sessionFile.replace('.json', '');
                            const sessionPath = (0, path_1.join)(projectPath, sessionFile);
                            try {
                                const sessionData = await (0, utils_1.readJsonFile)(sessionPath);
                                const updated = sessionData.time?.updated || sessionData.time?.created || 0;
                                conversations.set(sessionId, updated);
                            }
                            catch (error) {
                                console.warn(`Warning: Could not read session ${sessionId}:`, error);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.warn('Warning: Could not scan OpenCode storage:', error);
        }
        return conversations;
    }
    async getConversationData(conversationId) {
        try {
            // Find the session file
            const sessionDir = (0, path_1.join)(this.storagePath, 'session');
            const projectDirs = await fs_1.promises.readdir(sessionDir);
            for (const projectDir of projectDirs) {
                const projectPath = (0, path_1.join)(sessionDir, projectDir);
                const sessionPath = (0, path_1.join)(projectPath, `${conversationId}.json`);
                try {
                    await fs_1.promises.access(sessionPath);
                    const sessionData = await (0, utils_1.readJsonFile)(sessionPath);
                    // Get messages for this conversation
                    const messages = await this.getMessages(conversationId);
                    return {
                        id: conversationId,
                        metadata: {
                            title: sessionData.title || 'Untitled',
                            project: sessionData.projectID || 'unknown',
                            directory: sessionData.directory || '',
                            created: sessionData.time?.created || 0,
                            updated: sessionData.time?.updated || sessionData.time?.created || 0,
                            machine: require('os').hostname()
                        },
                        messages
                    };
                }
                catch (error) {
                    // Session file not found in this project, continue searching
                    continue;
                }
            }
        }
        catch (error) {
            console.error(`Error reading conversation ${conversationId}:`, error);
        }
        return null;
    }
    async getMessages(conversationId) {
        const messages = [];
        try {
            const messagesDir = (0, path_1.join)(this.storagePath, 'message', conversationId);
            try {
                await fs_1.promises.access(messagesDir);
                const messageFiles = await fs_1.promises.readdir(messagesDir);
                for (const messageFile of messageFiles) {
                    if (messageFile.endsWith('.json')) {
                        const messagePath = (0, path_1.join)(messagesDir, messageFile);
                        try {
                            const messageData = await (0, utils_1.readJsonFile)(messagePath);
                            messages.push(messageData);
                        }
                        catch (error) {
                            console.warn(`Warning: Could not read message ${messageFile}:`, error);
                        }
                    }
                }
                // Sort messages by timestamp
                messages.sort((a, b) => a.time.created - b.time.created);
            }
            catch (error) {
                // Messages directory doesn't exist, return empty array
            }
        }
        catch (error) {
            console.warn(`Warning: Could not scan messages for ${conversationId}:`, error);
        }
        return messages;
    }
}
exports.OpenCodeStorage = OpenCodeStorage;
//# sourceMappingURL=opencode.js.map
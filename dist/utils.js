"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDir = ensureDir;
exports.readJsonFile = readJsonFile;
exports.writeJsonFile = writeJsonFile;
exports.getMachineName = getMachineName;
exports.formatTimestamp = formatTimestamp;
exports.formatBytes = formatBytes;
const fs_1 = require("fs");
async function ensureDir(dirPath) {
    try {
        await fs_1.promises.mkdir(dirPath, { recursive: true });
    }
    catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}
async function readJsonFile(filePath) {
    const content = await fs_1.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}
async function writeJsonFile(filePath, data) {
    const content = JSON.stringify(data, null, 2);
    await fs_1.promises.writeFile(filePath, content, 'utf-8');
}
function getMachineName() {
    return require('os').hostname();
}
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString();
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
//# sourceMappingURL=utils.js.map
#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = require("fs");
const path_1 = require("path");
const os = __importStar(require("os"));
const sync_1 = require("./sync");
const program = new commander_1.Command();
program
    .name('opencode-sync')
    .description('Sync OpenCode conversations between machines')
    .version('1.0.0');
program
    .command('check')
    .description('Check what needs sync between local and sync directory')
    .action(async () => {
    try {
        const { opencodePath, syncPath } = await getPaths();
        const sync = new sync_1.SyncManager(opencodePath, syncPath);
        const result = await sync.check();
        console.log(chalk_1.default.blue('OpenCode Sync Check'));
        console.log(chalk_1.default.gray('═'.repeat(50)));
        if (result.needsPush.length === 0 && result.needsPull.length === 0) {
            console.log(chalk_1.default.green('✓ All conversations are in sync!'));
            console.log(chalk_1.default.gray(`  Up to date: ${result.upToDate.length}`));
        }
        else {
            if (result.needsPush.length > 0) {
                console.log(chalk_1.default.yellow(`↑ Push needed: ${result.needsPush.length} conversation(s)`));
                result.needsPush.slice(0, 5).forEach(id => {
                    console.log(chalk_1.default.gray(`  - ${id}`));
                });
                if (result.needsPush.length > 5) {
                    console.log(chalk_1.default.gray(`  ... and ${result.needsPush.length - 5} more`));
                }
            }
            if (result.needsPull.length > 0) {
                console.log(chalk_1.default.cyan(`↓ Pull needed: ${result.needsPull.length} conversation(s)`));
                result.needsPull.slice(0, 5).forEach(id => {
                    console.log(chalk_1.default.gray(`  - ${id}`));
                });
                if (result.needsPull.length > 5) {
                    console.log(chalk_1.default.gray(`  ... and ${result.needsPull.length - 5} more`));
                }
            }
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
program
    .command('push [path]')
    .description('Push local conversations to sync directory (optional path overrides OPENCODE_SYNC_DIR)')
    .action(async (path) => {
    try {
        const { opencodePath, syncPath } = await getPaths(path);
        const sync = new sync_1.SyncManager(opencodePath, syncPath);
        await sync.push();
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
program
    .command('pull [path]')
    .description('Pull conversations from sync directory to local (optional path overrides OPENCODE_SYNC_DIR)')
    .action(async (path) => {
    try {
        const { opencodePath, syncPath } = await getPaths(path);
        const sync = new sync_1.SyncManager(opencodePath, syncPath);
        await sync.pull();
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
program
    .command('sync [path1] [path2]')
    .description(`Bidirectional sync between paths
  - No args: uses OPENCODE_STORAGE_DIR ↔ OPENCODE_SYNC_DIR
  - path1: syncs OPENCODE_STORAGE_DIR ↔ path1
  - path1 path2: syncs path1 ↔ path2`)
    .action(async (path1, path2) => {
    try {
        const syncPaths = await getSyncPaths(path1, path2);
        switch (syncPaths.mode) {
            case 'env':
                // Original behavior: use environment variables
                {
                    const sync = new sync_1.SyncManager(syncPaths.opencodePath, syncPaths.path1);
                    console.log(chalk_1.default.blue('Performing bidirectional sync...'));
                    await sync.push();
                    console.log();
                    await sync.pull();
                    console.log(chalk_1.default.green('✓ Sync completed!'));
                }
                break;
            case 'path1-only':
                // Path1 replaces OPENCODE_SYNC_DIR
                {
                    const sync = new sync_1.SyncManager(syncPaths.opencodePath, syncPaths.path1);
                    console.log(chalk_1.default.blue(`Performing bidirectional sync with ${syncPaths.path1}...`));
                    await sync.push();
                    console.log();
                    await sync.pull();
                    console.log(chalk_1.default.green('✓ Sync completed!'));
                }
                break;
            case 'dual-path':
                // Generic bidirectional sync between two directories
                {
                    console.log(chalk_1.default.blue(`Performing bidirectional sync between ${syncPaths.path1} and ${syncPaths.path2}...`));
                    await sync_1.SyncManager.syncDirectories(syncPaths.path1, syncPaths.path2);
                    console.log(chalk_1.default.green('✓ Sync completed!'));
                }
                break;
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
async function getPaths(syncPathOverride) {
    // Try environment variable first (maintain backward compatibility)
    let opencodePath = process.env.OPENCODE_STORAGE_DIR;
    // If env var not set, try autodetection
    if (!opencodePath) {
        opencodePath = await detectOpenCodeStorage();
        if (opencodePath) {
            console.log(chalk_1.default.blue(`✓ Auto-detected OpenCode storage: ${opencodePath}`));
        }
        else {
            // Provide helpful error message with detection attempts
            throw new Error('OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
                'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
                'Searched locations:\n' +
                '  - ~/.local/share/opencode/storage\n' +
                '  - ~/Library/Application Support/opencode/storage\n' +
                '  - ~/.config/opencode/storage\n' +
                '  - ~/.opencode/storage\n' +
                '  - ~/AppData/Local/opencode/storage\n' +
                '  - ~/AppData/Roaming/opencode/storage');
        }
    }
    const syncPath = syncPathOverride || process.env.OPENCODE_SYNC_DIR;
    if (!syncPath) {
        throw new Error('OPENCODE_SYNC_DIR environment variable is not set (and no path provided)');
    }
    return { opencodePath: opencodePath, syncPath };
}
async function getSyncPaths(path1, path2) {
    // Validate paths if provided
    if (path1) {
        try {
            await fs_1.promises.access(path1);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Path does not exist: ${path1}`);
            }
            else if (error.code === 'EACCES') {
                throw new Error(`Permission denied: ${path1}`);
            }
            else {
                throw new Error(`Cannot access path ${path1}: ${error.message}`);
            }
        }
    }
    if (path2) {
        try {
            await fs_1.promises.access(path2);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Path does not exist: ${path2}`);
            }
            else if (error.code === 'EACCES') {
                throw new Error(`Permission denied: ${path2}`);
            }
            else {
                throw new Error(`Cannot access path ${path2}: ${error.message}`);
            }
        }
    }
    // Prevent same path sync
    if (path1 && path2 && path1 === path2) {
        throw new Error('Cannot sync a path to itself');
    }
    // Determine mode and return appropriate configuration
    if (!path1 && !path2) {
        // No paths: use environment variables (current behavior)
        let opencodePath = process.env.OPENCODE_STORAGE_DIR;
        if (!opencodePath) {
            opencodePath = await detectOpenCodeStorage();
            if (opencodePath) {
                console.log(chalk_1.default.blue(`✓ Auto-detected OpenCode storage: ${opencodePath}`));
            }
            else {
                throw new Error('OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
                    'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
                    'Searched locations:\n' +
                    '  - ~/.local/share/opencode/storage\n' +
                    '  - ~/Library/Application Support/opencode/storage\n' +
                    '  - ~/.config/opencode/storage\n' +
                    '  - ~/.opencode/storage\n' +
                    '  - ~/AppData/Local/opencode/storage\n' +
                    '  - ~/AppData/Roaming/opencode/storage');
            }
        }
        const syncPath = process.env.OPENCODE_SYNC_DIR;
        if (!syncPath) {
            throw new Error('OPENCODE_SYNC_DIR environment variable is not set');
        }
        return {
            mode: 'env',
            path1: syncPath,
            path2: '',
            opencodePath: opencodePath
        };
    }
    else if (path1 && !path2) {
        // Path1 only: treat as sync target, use env var for OpenCode storage
        let opencodePath = process.env.OPENCODE_STORAGE_DIR;
        if (!opencodePath) {
            opencodePath = await detectOpenCodeStorage();
            if (opencodePath) {
                console.log(chalk_1.default.blue(`✓ Auto-detected OpenCode storage: ${opencodePath}`));
            }
            else {
                throw new Error('OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
                    'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
                    'Searched locations:\n' +
                    '  - ~/.local/share/opencode/storage\n' +
                    '  - ~/Library/Application Support/opencode/storage\n' +
                    '  - ~/.config/opencode/storage\n' +
                    '  - ~/.opencode/storage\n' +
                    '  - ~/AppData/Local/opencode/storage\n' +
                    '  - ~/AppData/Roaming/opencode/storage');
            }
        }
        return {
            mode: 'path1-only',
            path1,
            path2: '',
            opencodePath: opencodePath
        };
    }
    else if (path1 && path2) {
        // Dual path: bidirectional sync between two explicit paths
        return {
            mode: 'dual-path',
            path1,
            path2,
            opencodePath: undefined
        };
    }
    // This should never happen, but TypeScript needs it
    throw new Error('Invalid path configuration');
}
async function detectOpenCodeStorage() {
    // Priority order for OpenCode storage detection
    const candidates = [
        // Primary: XDG standard location (Linux/macOS)
        (0, path_1.join)(os.homedir(), '.local', 'share', 'opencode', 'storage'),
        // Secondary: Application Support (macOS)
        (0, path_1.join)(os.homedir(), 'Library', 'Application Support', 'opencode', 'storage'),
        // Tertiary: Config directory (some Linux distros)
        (0, path_1.join)(os.homedir(), '.config', 'opencode', 'storage'),
        // Legacy: Direct home directory (fallback)
        (0, path_1.join)(os.homedir(), '.opencode', 'storage'),
        // Windows: AppData locations
        (0, path_1.join)(os.homedir(), 'AppData', 'Local', 'opencode', 'storage'),
        (0, path_1.join)(os.homedir(), 'AppData', 'Roaming', 'opencode', 'storage')
    ];
    for (const candidate of candidates) {
        try {
            // Check if directory exists and is accessible
            await fs_1.promises.access(candidate);
            // Verify it's actually OpenCode storage by checking for key directories
            const hasSessionDir = await fs_1.promises.access((0, path_1.join)(candidate, 'session')).then(() => true).catch(() => false);
            const hasMessageDir = await fs_1.promises.access((0, path_1.join)(candidate, 'message')).then(() => true).catch(() => false);
            if (hasSessionDir || hasMessageDir) {
                return candidate;
            }
        }
        catch {
            // Continue to next candidate
        }
    }
    return undefined;
}
// Show help if no command provided
if (process.argv.length === 2) {
    program.help();
}
program.parse();
//# sourceMappingURL=cli.js.map
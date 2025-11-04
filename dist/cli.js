#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const sync_service_1 = require("./services/sync-service");
const import_service_1 = require("./services/import-service");
const program = new commander_1.Command();
const syncService = new sync_service_1.SyncService();
const importService = new import_service_1.ImportService('./imported');
program
    .name('opencode-sync')
    .description('Sync OpenCode conversations between machines')
    .version('1.0.0');
program
    .command('check')
    .description('Check what needs sync between local and sync directory')
    .action(async () => {
    try {
        await syncService.checkStatus();
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
        await syncService.pushConversations(path);
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
        await syncService.pullConversations(path);
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
        await syncService.syncConversations(path1, path2);
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
program
    .command('import <path>')
    .description('Import conversations from external format')
    .requiredOption('--format <format>', 'Source format (available: ' + importService.getAvailableFormats().join(', ') + ')')
    .option('--preview', 'Preview what would be imported without making changes')
    .action(async (path, options) => {
    try {
        await importService.importFrom(path, options.format, options.preview);
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
program
    .command('scan <path>')
    .description('Scan directory to detect conversation formats')
    .action(async (path) => {
    try {
        const detectedFormat = await importService.detectFormat(path);
        if (detectedFormat) {
            console.log(chalk_1.default.green(`✓ Detected format: ${detectedFormat}`));
            console.log(chalk_1.default.gray(`  You can import using: opencode-sync import --format ${detectedFormat} ${path}`));
        }
        else {
            console.log(chalk_1.default.yellow('⚠ No supported conversation formats detected'));
            console.log(chalk_1.default.gray('  Supported formats: ' + importService.getAvailableFormats().join(', ')));
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Show help if no command provided
if (process.argv.length === 2) {
    program.help();
}
program.parse();
//# sourceMappingURL=cli.js.map
#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { SyncService } from './services/sync-service';
import { ImportService } from './services/import-service';

const program = new Command();
const syncService = new SyncService();
const importService = new ImportService('./imported');

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
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('push [path]')
  .description('Push local conversations to sync directory (optional path overrides OPENCODE_SYNC_DIR)')
  .action(async (path) => {
    try {
      await syncService.pushConversations(path);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('pull [path]')
  .description('Pull conversations from sync directory to local (optional path overrides OPENCODE_SYNC_DIR)')
  .action(async (path) => {
    try {
      await syncService.pullConversations(path);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
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
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('import <path>')
  .description('Import conversations from external format')
  .requiredOption('--format <format>', 'Source format (available: ' + importService.getAvailableFormats().join(', ') + ')')
  .action(async (path, options) => {
    try {
      await importService.importFrom(path, options.format);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();
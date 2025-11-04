#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { SyncManager } from './sync';

const program = new Command();

program
  .name('opencode-sync')
  .description('Sync OpenCode conversations between machines')
  .version('1.0.0');

program
  .command('check')
  .description('Check what needs sync between local and sync directory')
  .action(async () => {
    try {
      const { opencodePath, syncPath } = getPaths();
      const sync = new SyncManager(opencodePath, syncPath);
      const result = await sync.check();
      
      console.log(chalk.blue('OpenCode Sync Check'));
      console.log(chalk.gray('═'.repeat(50)));
      
      if (result.needsPush.length === 0 && result.needsPull.length === 0) {
        console.log(chalk.green('✓ All conversations are in sync!'));
        console.log(chalk.gray(`  Up to date: ${result.upToDate.length}`));
      } else {
        if (result.needsPush.length > 0) {
          console.log(chalk.yellow(`↑ Push needed: ${result.needsPush.length} conversation(s)`));
          result.needsPush.slice(0, 5).forEach(id => {
            console.log(chalk.gray(`  - ${id}`));
          });
          if (result.needsPush.length > 5) {
            console.log(chalk.gray(`  ... and ${result.needsPush.length - 5} more`));
          }
        }
        
        if (result.needsPull.length > 0) {
          console.log(chalk.cyan(`↓ Pull needed: ${result.needsPull.length} conversation(s)`));
          result.needsPull.slice(0, 5).forEach(id => {
            console.log(chalk.gray(`  - ${id}`));
          });
          if (result.needsPull.length > 5) {
            console.log(chalk.gray(`  ... and ${result.needsPull.length - 5} more`));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('push')
  .description('Push local conversations to sync directory')
  .action(async () => {
    try {
      const { opencodePath, syncPath } = getPaths();
      const sync = new SyncManager(opencodePath, syncPath);
      await sync.push();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('pull')
  .description('Pull conversations from sync directory to local')
  .action(async () => {
    try {
      const { opencodePath, syncPath } = getPaths();
      const sync = new SyncManager(opencodePath, syncPath);
      await sync.pull();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Perform bidirectional sync (push then pull)')
  .action(async () => {
    try {
      const { opencodePath, syncPath } = getPaths();
      const sync = new SyncManager(opencodePath, syncPath);
      
      console.log(chalk.blue('Performing bidirectional sync...'));
      await sync.push();
      console.log();
      await sync.pull();
      console.log(chalk.green('✓ Sync completed!'));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function getPaths(): { opencodePath: string; syncPath: string } {
  const opencodePath = process.env.OPENCODE_STORAGE_DIR;
  if (!opencodePath) {
    throw new Error('OPENCODE_STORAGE_DIR environment variable is not set');
  }

  const syncPath = process.env.OPENCODE_SYNC_DIR;
  if (!syncPath) {
    throw new Error('OPENCODE_SYNC_DIR environment variable is not set');
  }

  return { opencodePath, syncPath };
}

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();
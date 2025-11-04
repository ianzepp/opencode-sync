#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as os from 'os';
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
      const { opencodePath, syncPath } = await getPaths();
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
  .command('push [path]')
  .description('Push local conversations to sync directory (optional path overrides OPENCODE_SYNC_DIR)')
  .action(async (path) => {
    try {
      const { opencodePath, syncPath } = await getPaths(path);
      const sync = new SyncManager(opencodePath, syncPath);
      await sync.push();
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
      const { opencodePath, syncPath } = await getPaths(path);
      const sync = new SyncManager(opencodePath, syncPath);
      await sync.pull();
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
      const syncPaths = await getSyncPaths(path1, path2);
      
      switch (syncPaths.mode) {
        case 'env':
          // Original behavior: use environment variables
          {
            const sync = new SyncManager(syncPaths.opencodePath!, syncPaths.path1);
            console.log(chalk.blue('Performing bidirectional sync...'));
            await sync.push();
            console.log();
            await sync.pull();
            console.log(chalk.green('✓ Sync completed!'));
          }
          break;
          
        case 'path1-only':
          // Path1 replaces OPENCODE_SYNC_DIR
          {
            const sync = new SyncManager(syncPaths.opencodePath!, syncPaths.path1);
            console.log(chalk.blue(`Performing bidirectional sync with ${syncPaths.path1}...`));
            await sync.push();
            console.log();
            await sync.pull();
            console.log(chalk.green('✓ Sync completed!'));
          }
          break;
          
        case 'dual-path':
          // Generic bidirectional sync between two directories
          {
            console.log(chalk.blue(`Performing bidirectional sync between ${syncPaths.path1} and ${syncPaths.path2}...`));
            await SyncManager.syncDirectories(syncPaths.path1, syncPaths.path2);
            console.log(chalk.green('✓ Sync completed!'));
          }
          break;
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function getPaths(syncPathOverride?: string): Promise<{ opencodePath: string; syncPath: string }> {
  // Try environment variable first (maintain backward compatibility)
  let opencodePath = process.env.OPENCODE_STORAGE_DIR;
  
  // If env var not set, try autodetection
  if (!opencodePath) {
    opencodePath = await detectOpenCodeStorage();
    
    if (opencodePath) {
      console.log(chalk.blue(`✓ Auto-detected OpenCode storage: ${opencodePath}`));
    } else {
      // Provide helpful error message with detection attempts
      throw new Error(
        'OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
        'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
        'Searched locations:\n' +
        '  - ~/.local/share/opencode/storage\n' +
        '  - ~/Library/Application Support/opencode/storage\n' +
        '  - ~/.config/opencode/storage\n' +
        '  - ~/.opencode/storage\n' +
        '  - ~/AppData/Local/opencode/storage\n' +
        '  - ~/AppData/Roaming/opencode/storage'
      );
    }
  }

  const syncPath = syncPathOverride || process.env.OPENCODE_SYNC_DIR;
  if (!syncPath) {
    throw new Error('OPENCODE_SYNC_DIR environment variable is not set (and no path provided)');
  }

  return { opencodePath: opencodePath!, syncPath };
}

interface SyncPathsResult {
  mode: 'env' | 'path1-only' | 'dual-path';
  path1: string;
  path2: string;
  opencodePath?: string;
}

async function getSyncPaths(path1?: string, path2?: string): Promise<SyncPathsResult> {
  // Validate paths if provided
  if (path1) {
    try {
      await fs.access(path1);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${path1}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${path1}`);
      } else {
        throw new Error(`Cannot access path ${path1}: ${error.message}`);
      }
    }
  }
  
  if (path2) {
    try {
      await fs.access(path2);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${path2}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${path2}`);
      } else {
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
        console.log(chalk.blue(`✓ Auto-detected OpenCode storage: ${opencodePath}`));
      } else {
        throw new Error(
          'OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
          'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
          'Searched locations:\n' +
          '  - ~/.local/share/opencode/storage\n' +
          '  - ~/Library/Application Support/opencode/storage\n' +
          '  - ~/.config/opencode/storage\n' +
          '  - ~/.opencode/storage\n' +
          '  - ~/AppData/Local/opencode/storage\n' +
          '  - ~/AppData/Roaming/opencode/storage'
        );
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
      opencodePath: opencodePath!
    };
  } else if (path1 && !path2) {
    // Path1 only: treat as sync target, use env var for OpenCode storage
    let opencodePath = process.env.OPENCODE_STORAGE_DIR;
    if (!opencodePath) {
      opencodePath = await detectOpenCodeStorage();
      if (opencodePath) {
        console.log(chalk.blue(`✓ Auto-detected OpenCode storage: ${opencodePath}`));
      } else {
        throw new Error(
          'OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
          'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
          'Searched locations:\n' +
          '  - ~/.local/share/opencode/storage\n' +
          '  - ~/Library/Application Support/opencode/storage\n' +
          '  - ~/.config/opencode/storage\n' +
          '  - ~/.opencode/storage\n' +
          '  - ~/AppData/Local/opencode/storage\n' +
          '  - ~/AppData/Roaming/opencode/storage'
        );
      }
    }
    
    return {
      mode: 'path1-only',
      path1,
      path2: '',
      opencodePath: opencodePath!
    };
  } else if (path1 && path2) {
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

async function detectOpenCodeStorage(): Promise<string | undefined> {
  // Priority order for OpenCode storage detection
  const candidates = [
    // Primary: XDG standard location (Linux/macOS)
    join(os.homedir(), '.local', 'share', 'opencode', 'storage'),
    
    // Secondary: Application Support (macOS)
    join(os.homedir(), 'Library', 'Application Support', 'opencode', 'storage'),
    
    // Tertiary: Config directory (some Linux distros)
    join(os.homedir(), '.config', 'opencode', 'storage'),
    
    // Legacy: Direct home directory (fallback)
    join(os.homedir(), '.opencode', 'storage'),
    
    // Windows: AppData locations
    join(os.homedir(), 'AppData', 'Local', 'opencode', 'storage'),
    join(os.homedir(), 'AppData', 'Roaming', 'opencode', 'storage')
  ];
  
  for (const candidate of candidates) {
    try {
      // Check if directory exists and is accessible
      await fs.access(candidate);
      
      // Verify it's actually OpenCode storage by checking for key directories
      const hasSessionDir = await fs.access(join(candidate, 'session')).then(() => true).catch(() => false);
      const hasMessageDir = await fs.access(join(candidate, 'message')).then(() => true).catch(() => false);
      
      if (hasSessionDir || hasMessageDir) {
        return candidate;
      }
    } catch {
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
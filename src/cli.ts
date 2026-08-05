#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'path';
import { RemoteOptions, SyncService } from './services/sync-service';
import { ImportService } from './services/import-service';
import { PathService } from './services/path-service';
import { serve, serveFromSyncDir } from './web/server';
import { OpenCodeWriter } from './opencode-writer';
import { CodexCLIImportStrategy } from './importers/codex-cli';

const program = new Command();
const syncService = new SyncService();
const importService = new ImportService('./imported');

function getRemoteOptions(opts: any): RemoteOptions | undefined {
  if (opts.remoteUrl) {
    return { url: opts.remoteUrl, prefix: opts.remotePrefix, username: opts.remoteUser, password: opts.remotePass };
  }
  return undefined;
}

const remoteOptions = [
  ['--remote-url <url>', 'WebDAV URL (e.g. https://server.com/dav)'],
  ['--remote-user <user>', 'WebDAV username'],
  ['--remote-pass <pass>', 'WebDAV password'],
  ['--remote-prefix <path>', 'WebDAV path prefix'],
] as const;

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

const pushCmd = program
  .command('push [path]')
  .description('Push local conversations to sync directory (or --remote-url for WebDAV)');
for (const [flags, desc] of remoteOptions) pushCmd.option(flags, desc);
pushCmd.action(async (path, options) => {
  try {
    const remote = getRemoteOptions(options);
    await syncService.pushConversations(remote || path);
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});

const pullCmd = program
  .command('pull [path]')
  .description('Pull conversations from sync directory (or --remote-url for WebDAV)');
for (const [flags, desc] of remoteOptions) pullCmd.option(flags, desc);
pullCmd.action(async (path, options) => {
  try {
    const remote = getRemoteOptions(options);
    await syncService.pullConversations(remote || path);
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
  .option('--preview', 'Preview what would be imported without making changes')
  .option('--force', 'Re-import files even if they were previously imported')
  .action(async (path, options) => {
    try {
      await importService.importFrom(path, options.format, {
        preview: options.preview,
        force: options.force
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
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
        console.log(chalk.green(`✓ Detected format: ${detectedFormat}`));
        console.log(chalk.gray(`  You can import using: opencode-sync import --format ${detectedFormat} ${path}`));
      } else {
        console.log(chalk.yellow('⚠ No supported conversation formats detected'));
        console.log(chalk.gray('  Supported formats: ' + importService.getAvailableFormats().join(', ')));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start web UI for browsing and searching conversations')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--sync-dir <path>', 'Also serve from sync dir (local path or https:// URL for WebDAV)')
  .option('--codex-path <path>', 'Codex CLI directory to import (overrides CODEX_HOME)')
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const pathService = new PathService();
      const { opencodePath } = await pathService.getPaths();
      const configuredCodexPath = options.codexPath || process.env.CODEX_HOME?.trim();
      const codexPath = await pathService.detectCodexPath(options.codexPath);

      if (configuredCodexPath && !codexPath) {
        throw new Error(`Codex CLI directory is invalid or does not contain state_*.sqlite and sessions: ${configuredCodexPath}`);
      }

      if (codexPath) {
        const dbPath = join(opencodePath, '..', 'opencode.db');
        console.log(chalk.blue('Auto-importing Codex CLI conversations into database...'));
        const strategy = new CodexCLIImportStrategy('');
        const result = await strategy.import(codexPath);
        if (result.imported.length > 0) {
          const writer = new OpenCodeWriter(dbPath);
          let imported = 0, skipped = 0;
          for (const conv of result.imported) {
            if (writer.writeConversation(conv, 'codex')) imported++; else skipped++;
          }
          writer.close();
          console.log(chalk.green(`  ✓ Imported ${imported} conversation(s)` + (skipped ? ` (${skipped} skipped)` : '')));
        }
      }

      console.log(chalk.blue(`Starting OpenCode Web UI on port ${port}...`));
      await serve(opencodePath, port, options.syncDir || undefined);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('sync-codex [codex-path]')
  .description('Import Codex CLI conversations into opencode.db (uses CODEX_HOME when omitted)')
  .option('--db-path <path>', 'Path to opencode.db (default: auto-detect)')
  .action(async (codexPathArg, options) => {
    try {
      const pathService = new PathService();
      const configuredCodexPath = codexPathArg || process.env.CODEX_HOME?.trim();
      const codexPath = await pathService.detectCodexPath(codexPathArg);

      if (!codexPath) {
        throw new Error(`Codex CLI directory not found. Pass <codex-path> or set CODEX_HOME${configuredCodexPath ? ` (checked: ${configuredCodexPath})` : ''}.`);
      }

      let dbPath = options.dbPath;
      if (!dbPath) {
        const { opencodePath } = await pathService.getPaths();
        dbPath = join(opencodePath, '..', 'opencode.db');
      }

      console.log(chalk.blue('Reading Codex conversations...'));
      const strategy = new CodexCLIImportStrategy('');
      const result = await strategy.import(codexPath);

      if (result.imported.length === 0) {
        console.log(chalk.yellow('No conversations found.'));
        return;
      }

      console.log(chalk.blue(`Found ${result.imported.length} conversations, writing to ${dbPath}...`));

      const writer = new OpenCodeWriter(dbPath);
      let imported = 0;
      let skipped = 0;

      for (const conv of result.imported) {
        const id = writer.writeConversation(conv, 'codex');
        if (id) {
          imported++;
        } else {
          skipped++;
        }
      }

      const stats = writer.getStats();
      writer.close();

      console.log(chalk.green(`✓ Imported ${imported} conversation(s) into opencode.db`));
      if (skipped > 0) console.log(chalk.gray(`  ${skipped} already existed, skipped`));
      console.log(chalk.gray(`  DB stats: ${stats.sessions} sessions, ${stats.messages} messages, ${stats.parts} parts`));
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

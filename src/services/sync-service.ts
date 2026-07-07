import { SyncManager } from '../sync';
import { PathService, PathConfig, SyncPathConfig } from './path-service';
import { WebDAVSyncStorage } from './webdav-service';
import chalk from 'chalk';

export interface RemoteOptions {
  url: string;
  prefix?: string;
  username?: string;
  password?: string;
}

export class SyncService {
  private pathService: PathService;

  constructor() {
    this.pathService = new PathService();
  }

  async checkStatus(syncPathOverride?: string): Promise<void> {
    const { opencodePath, syncPath } = await this.pathService.getPaths(syncPathOverride);
    const sync = new SyncManager(opencodePath, syncPath);
    const result = await sync.check();
    
    this.displayCheckResult(result);
  }

  private async getOpenCodePath(): Promise<string> {
    const env = process.env.OPENCODE_STORAGE_DIR;
    if (env) return env;
    const detected = await this.pathService.detectOpenCodeStorage();
    if (detected) return detected;
    throw new Error('OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.');
  }

  async pushConversations(syncPathOrRemote?: string | RemoteOptions): Promise<void> {
    if (typeof syncPathOrRemote === 'object') {
      const opencodePath = await this.getOpenCodePath();
      const remote = syncPathOrRemote as RemoteOptions;
      const storage = new WebDAVSyncStorage(remote.url, remote.prefix || '', remote.username, remote.password);
      const sync = new SyncManager(opencodePath, storage);
      await sync.push();
    } else {
      const { opencodePath, syncPath } = await this.pathService.getPaths(syncPathOrRemote as string);
      const sync = new SyncManager(opencodePath, syncPath);
      await sync.push();
    }
  }

  async pullConversations(syncPathOrRemote?: string | RemoteOptions): Promise<void> {
    if (typeof syncPathOrRemote === 'object') {
      const opencodePath = await this.getOpenCodePath();
      const remote = syncPathOrRemote as RemoteOptions;
      const storage = new WebDAVSyncStorage(remote.url, remote.prefix || '', remote.username, remote.password);
      const sync = new SyncManager(opencodePath, storage);
      await sync.pull();
    } else {
      const { opencodePath, syncPath } = await this.pathService.getPaths(syncPathOrRemote as string);
      const sync = new SyncManager(opencodePath, syncPath);
      await sync.pull();
    }
  }

  async syncConversations(path1?: string, path2?: string): Promise<void> {
    const syncPaths = await this.pathService.getSyncPaths(path1, path2);
    
    switch (syncPaths.mode) {
      case 'env':
      case 'path1-only':
        {
          const sync = new SyncManager(syncPaths.opencodePath!, syncPaths.path1);
          console.log(chalk.blue('Performing bidirectional sync...'));
          await sync.push();
          console.log();
          await sync.pull();
          console.log(chalk.green('✓ Sync completed!'));
        }
        break;
        
      case 'dual-path':
        {
          console.log(chalk.blue(`Performing bidirectional sync between ${syncPaths.path1} and ${syncPaths.path2}...`));
          await SyncManager.syncDirectories(syncPaths.path1, syncPaths.path2);
          console.log(chalk.green('✓ Sync completed!'));
        }
        break;
    }
  }

  private displayCheckResult(result: any): void {
    console.log(chalk.blue('OpenCode Sync Check'));
    console.log(chalk.gray('═'.repeat(50)));
    
    if (result.needsPush.length === 0 && result.needsPull.length === 0) {
      console.log(chalk.green('✓ All conversations are in sync!'));
      console.log(chalk.gray(`  Up to date: ${result.upToDate.length}`));
    } else {
      if (result.needsPush.length > 0) {
        console.log(chalk.yellow(`↑ Push needed: ${result.needsPush.length} conversation(s)`));
        result.needsPush.slice(0, 5).forEach((id: string) => {
          console.log(chalk.gray(`  - ${id}`));
        });
        if (result.needsPush.length > 5) {
          console.log(chalk.gray(`  ... and ${result.needsPush.length - 5} more`));
        }
      }
      
      if (result.needsPull.length > 0) {
        console.log(chalk.cyan(`↓ Pull needed: ${result.needsPull.length} conversation(s)`));
        result.needsPull.slice(0, 5).forEach((id: string) => {
          console.log(chalk.gray(`  - ${id}`));
        });
        if (result.needsPull.length > 5) {
          console.log(chalk.gray(`  ... and ${result.needsPull.length - 5} more`));
        }
      }
    }
  }

  async getAutoDetectedPath(): Promise<string | undefined> {
    return await this.pathService.detectOpenCodeStorage();
  }
}
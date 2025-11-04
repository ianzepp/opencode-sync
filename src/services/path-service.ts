import { join } from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

export interface PathConfig {
  opencodePath: string;
  syncPath: string;
}

export interface SyncPathConfig {
  mode: 'env' | 'path1-only' | 'dual-path';
  path1: string;
  path2: string;
  opencodePath?: string;
}

export class PathService {
  private static readonly OPENCODE_CANDIDATES = [
    join(os.homedir(), '.local', 'share', 'opencode', 'storage'),
    join(os.homedir(), 'Library', 'Application Support', 'opencode', 'storage'),
    join(os.homedir(), '.config', 'opencode', 'storage'),
    join(os.homedir(), '.opencode', 'storage'),
    join(os.homedir(), 'AppData', 'Local', 'opencode', 'storage'),
    join(os.homedir(), 'AppData', 'Roaming', 'opencode', 'storage')
  ];

  async getPaths(syncPathOverride?: string): Promise<PathConfig> {
    let opencodePath = process.env.OPENCODE_STORAGE_DIR;
    
    if (!opencodePath) {
      opencodePath = await this.detectOpenCodeStorage();
      if (!opencodePath) {
        throw this.createOpenCodeNotFoundError();
      }
    }

    const syncPath = syncPathOverride || process.env.OPENCODE_SYNC_DIR;
    if (!syncPath) {
      throw new Error('OPENCODE_SYNC_DIR environment variable is not set (and no path provided)');
    }

    return { opencodePath, syncPath };
  }

  async getSyncPaths(path1?: string, path2?: string): Promise<SyncPathConfig> {
    // Validate paths if provided
    if (path1) {
      await this.validatePath(path1, 'path1');
    }
    
    if (path2) {
      await this.validatePath(path2, 'path2');
    }
    
    // Prevent same path sync
    if (path1 && path2 && path1 === path2) {
      throw new Error('Cannot sync a path to itself');
    }
    
    // Determine mode and return appropriate configuration
    if (!path1 && !path2) {
      return await this.getEnvModeConfig();
    } else if (path1 && !path2) {
      return await this.getPath1OnlyModeConfig(path1);
    } else if (path1 && path2) {
      return { mode: 'dual-path', path1, path2 };
    }
    
    throw new Error('Invalid path configuration');
  }

  async detectOpenCodeStorage(): Promise<string | undefined> {
    for (const candidate of PathService.OPENCODE_CANDIDATES) {
      try {
        await fs.access(candidate);
        
        // Verify it's actually OpenCode storage by checking for key directories
        const hasSessionDir = await fs.access(join(candidate, 'session'))
          .then(() => true).catch(() => false);
        const hasMessageDir = await fs.access(join(candidate, 'message'))
          .then(() => true).catch(() => false);
        
        if (hasSessionDir || hasMessageDir) {
          return candidate;
        }
      } catch {
        // Continue to next candidate
      }
    }
    
    return undefined;
  }

  private async validatePath(path: string, pathName: string): Promise<void> {
    try {
      await fs.access(path);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${path}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`Permission denied: ${path}`);
      } else {
        throw new Error(`Cannot access path ${path}: ${error.message}`);
      }
    }
  }

  private async getEnvModeConfig(): Promise<SyncPathConfig> {
    let opencodePath = process.env.OPENCODE_STORAGE_DIR;
    if (!opencodePath) {
      opencodePath = await this.detectOpenCodeStorage();
      if (!opencodePath) {
        throw this.createOpenCodeNotFoundError();
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
      opencodePath
    };
  }

  private async getPath1OnlyModeConfig(path1: string): Promise<SyncPathConfig> {
    let opencodePath = process.env.OPENCODE_STORAGE_DIR;
    if (!opencodePath) {
      opencodePath = await this.detectOpenCodeStorage();
      if (!opencodePath) {
        throw this.createOpenCodeNotFoundError();
      }
    }
    
    return {
      mode: 'path1-only',
      path1,
      path2: '',
      opencodePath
    };
  }

  private createOpenCodeNotFoundError(): Error {
    return new Error(
      'OPENCODE_STORAGE_DIR environment variable is not set and OpenCode storage could not be auto-detected.\n' +
      'Please set OPENCODE_STORAGE_DIR or ensure OpenCode is properly installed.\n' +
      'Searched locations:\n' +
      PathService.OPENCODE_CANDIDATES.map(p => `  - ${p}`).join('\n')
    );
  }
}
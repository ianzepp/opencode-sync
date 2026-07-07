import { promises as fs } from 'fs';
import { join } from 'path';
import { createClient, WebDAVClient } from 'webdav';
import { Conversation } from '../types';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils';

export interface ISyncStorage {
  readonly name: string;
  conversationsPath: string;
  ensureDir(): Promise<void>;
  listConversations(): Promise<Map<string, number>>;
  readConversation(id: string): Promise<Conversation>;
  writeConversation(id: string, conv: Conversation): Promise<void>;
}

export class LocalSyncStorage implements ISyncStorage {
  readonly name: string;
  readonly conversationsPath: string;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.name = `local:${basePath}`;
    this.conversationsPath = join(basePath, 'conversations');
  }

  async ensureDir(): Promise<void> {
    await ensureDir(this.conversationsPath);
  }

  async listConversations(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    try {
      await fs.access(this.conversationsPath);
      const files = await fs.readdir(this.conversationsPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = file.replace('.json', '');
          try {
            const conv = await readJsonFile<Conversation>(join(this.conversationsPath, file));
            result.set(id, conv.metadata.updated);
          } catch { /* skip corrupt file */ }
        }
      }
    } catch { /* directory doesn't exist */ }
    return result;
  }

  async readConversation(id: string): Promise<Conversation> {
    return readJsonFile<Conversation>(join(this.conversationsPath, `${id}.json`));
  }

  async writeConversation(id: string, conv: Conversation): Promise<void> {
    await writeJsonFile(join(this.conversationsPath, `${id}.json`), conv);
  }
}

export class WebDAVSyncStorage implements ISyncStorage {
  readonly name: string;
  readonly conversationsPath: string;
  private client: WebDAVClient;

  constructor(baseUrl: string, prefix: string, username?: string, password?: string) {
    this.name = `webdav:${baseUrl}`;
    this.conversationsPath = prefix ? `${prefix}/conversations` : '/conversations';
    this.client = createClient(baseUrl, { username, password });
  }

  async ensureDir(): Promise<void> {
    try {
      await this.client.createDirectory(this.conversationsPath, { recursive: true });
    } catch {
      // directory already exists
    }
  }

  async listConversations(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    try {
      const items = await this.client.getDirectoryContents(this.conversationsPath) as { filename: string; basename: string; type: string }[];
      for (const item of items) {
        if (item.type === 'file' && item.basename.endsWith('.json')) {
          const id = item.basename.replace('.json', '');
          try {
            const raw = await this.client.getFileContents(`${this.conversationsPath}/${item.basename}`, { format: 'text' }) as string;
            const conv = JSON.parse(raw) as Conversation;
            result.set(id, conv.metadata.updated);
          } catch { /* skip corrupt file */ }
        }
      }
    } catch {
      // directory doesn't exist yet
    }
    return result;
  }

  async readConversation(id: string): Promise<Conversation> {
    const raw = await this.client.getFileContents(`${this.conversationsPath}/${id}.json`, { format: 'text' }) as string;
    return JSON.parse(raw) as Conversation;
  }

  async writeConversation(id: string, conv: Conversation): Promise<void> {
    await this.client.putFileContents(`${this.conversationsPath}/${id}.json`, JSON.stringify(conv, null, 2), {
      overwrite: true
    });
  }
}

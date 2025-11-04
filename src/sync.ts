import { promises as fs } from 'fs';
import { join } from 'path';
import { Conversation, SyncResult } from './types';
import { OpenCodeStorage } from './opencode';
import { readJsonFile, writeJsonFile, ensureDir, getMachineName } from './utils';

export class SyncManager {
  private opencodeStorage: OpenCodeStorage;
  private syncPath: string;
  private conversationsPath: string;

  constructor(opencodePath: string, syncPath: string) {
    this.opencodeStorage = new OpenCodeStorage(opencodePath);
    this.syncPath = syncPath;
    this.conversationsPath = join(syncPath, 'conversations');
  }

  async check(): Promise<SyncResult> {
    const localConversations = await this.opencodeStorage.getConversations();
    const syncConversations = await this.getSyncConversations();

    const result: SyncResult = {
      needsPush: [],
      needsPull: [],
      upToDate: []
    };

    // Check all conversations from both sources
    const allConversationIds = new Set([
      ...localConversations.keys(),
      ...syncConversations.keys()
    ]);

    for (const convId of allConversationIds) {
      const localUpdated = localConversations.get(convId) || 0;
      const syncUpdated = syncConversations.get(convId) || 0;

      if (localUpdated > syncUpdated) {
        result.needsPush.push(convId);
      } else if (syncUpdated > localUpdated) {
        result.needsPull.push(convId);
      } else if (localUpdated > 0) {
        result.upToDate.push(convId);
      }
    }

    return result;
  }

  async push(): Promise<void> {
    const result = await this.check();
    
    if (result.needsPush.length === 0) {
      console.log('No conversations need to be pushed.');
      return;
    }

    console.log(`Pushing ${result.needsPush.length} conversation(s)...`);
    
    await ensureDir(this.conversationsPath);

    for (const convId of result.needsPush) {
      const conversation = await this.opencodeStorage.getConversationData(convId);
      if (conversation) {
        const syncFile = join(this.conversationsPath, `${convId}.json`);
        await writeJsonFile(syncFile, conversation);
        console.log(`  ✓ Pushed: ${convId} (${conversation.metadata.title})`);
      }
    }

    console.log('Push completed successfully.');
  }

  async pull(): Promise<void> {
    const result = await this.check();
    
    if (result.needsPull.length === 0) {
      console.log('No conversations need to be pulled.');
      return;
    }

    console.log(`Pulling ${result.needsPull.length} conversation(s)...`);

    for (const convId of result.needsPull) {
      const syncFile = join(this.conversationsPath, `${convId}.json`);
      
      try {
        const conversation = await readJsonFile<Conversation>(syncFile);
        await this.importConversation(conversation);
        console.log(`  ✓ Pulled: ${convId} (${conversation.metadata.title})`);
      } catch (error) {
        console.error(`  ✗ Failed to pull ${convId}:`, error);
      }
    }

    console.log('Pull completed successfully.');
  }

  private async getSyncConversations(): Promise<Map<string, number>> {
    const conversations = new Map<string, number>();
    
    try {
      await fs.access(this.conversationsPath);
      const files = await fs.readdir(this.conversationsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const convId = file.replace('.json', '');
          const filePath = join(this.conversationsPath, file);
          
          try {
            const conversation = await readJsonFile<Conversation>(filePath);
            conversations.set(convId, conversation.metadata.updated);
          } catch (error) {
            console.warn(`Warning: Could not read sync file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      // Sync directory doesn't exist yet
    }
    
    return conversations;
  }

  private async importConversation(conversation: Conversation): Promise<void> {
    // This is a simplified import - in a real implementation, we'd need to
    // properly integrate with OpenCode's storage format
    // For now, we'll just copy the data to the local storage
    
    const opencodePath = this.opencodeStorage.constructor.toString().includes('OpenCodeStorage') 
      ? (this.opencodeStorage as any).storagePath 
      : process.env.OPENCODE_STORAGE_DIR;
    
    if (!opencodePath) {
      throw new Error('OpenCode storage path not available');
    }

    // Create a simple import marker file (simplified approach)
    const importMarker = join(opencodePath, 'sync_imported', `${conversation.id}.json`);
    await ensureDir(join(opencodePath, 'sync_imported'));
    await writeJsonFile(importMarker, conversation);
    
    console.log(`  Imported conversation ${conversation.id} to local storage`);
  }
}
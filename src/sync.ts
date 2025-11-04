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
  
  // Static method for generic directory-to-directory sync
  static async syncDirectories(path1: string, path2: string): Promise<void> {
    // Create sync instances for both directions
    const sync1to2 = new DirectorySync(path1, path2);
    const sync2to1 = new DirectorySync(path2, path1);
    
    // Check both directions
    const result1to2 = await sync1to2.check();
    const result2to1 = await sync2to1.check();
    
    if (result1to2.needsPush.length === 0 && result2to1.needsPush.length === 0) {
      console.log('No conversations need to be synced.');
      return;
    }
    
    // Perform bidirectional sync
    if (result1to2.needsPush.length > 0) {
      console.log(`Pushing ${result1to2.needsPush.length} conversation(s) from ${path1} to ${path2}...`);
      await sync1to2.push();
    }
    
    if (result2to1.needsPush.length > 0) {
      console.log(`Pushing ${result2to1.needsPush.length} conversation(s) from ${path2} to ${path1}...`);
      await sync2to1.push();
    }
    
    console.log('Directory sync completed successfully.');
  }
}

// Helper class for generic directory-to-directory sync
class DirectorySync {
  constructor(private sourcePath: string, private targetPath: string) {}
  
  async check(): Promise<SyncResult> {
    const result: SyncResult = {
      needsPush: [],
      needsPull: [],
      upToDate: []
    };
    
    try {
      // Get conversations from source directory
      const sourceConversations = await this.getDirectoryConversations(this.sourcePath);
      const targetConversations = await this.getDirectoryConversations(this.targetPath);
      
      // Check all conversations from both sources
      const allConversationIds = new Set([
        ...sourceConversations.keys(),
        ...targetConversations.keys()
      ]);
      
      for (const convId of allConversationIds) {
        const sourceUpdated = sourceConversations.get(convId) || 0;
        const targetUpdated = targetConversations.get(convId) || 0;
        
        if (sourceUpdated > targetUpdated) {
          result.needsPush.push(convId);
        } else if (targetUpdated > sourceUpdated) {
          result.needsPull.push(convId);
        } else if (sourceUpdated > 0) {
          result.upToDate.push(convId);
        }
      }
    } catch (error) {
      console.warn('Warning: Could not check directory sync:', error);
    }
    
    return result;
  }
  
  async push(): Promise<void> {
    const result = await this.check();
    
    if (result.needsPush.length === 0) {
      return;
    }
    
    await ensureDir(join(this.targetPath, 'conversations'));
    
    for (const convId of result.needsPush) {
      const sourceFile = join(this.sourcePath, 'conversations', `${convId}.json`);
      const targetFile = join(this.targetPath, 'conversations', `${convId}.json`);
      
      try {
        const conversation = await readJsonFile<Conversation>(sourceFile);
        await writeJsonFile(targetFile, conversation);
        console.log(`  ✓ Pushed: ${convId} (${conversation.metadata.title})`);
      } catch (error) {
        console.error(`  ✗ Failed to push ${convId}:`, error);
      }
    }
  }
  
  private async getDirectoryConversations(dirPath: string): Promise<Map<string, number>> {
    const conversations = new Map<string, number>();
    
    try {
      const conversationsPath = join(dirPath, 'conversations');
      await fs.access(conversationsPath);
      const files = await fs.readdir(conversationsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const convId = file.replace('.json', '');
          const filePath = join(conversationsPath, file);
          
          try {
            const conversation = await readJsonFile<Conversation>(filePath);
            conversations.set(convId, conversation.metadata.updated);
          } catch (error) {
            console.warn(`Warning: Could not read conversation file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or is not accessible, return empty map
    }
    
    return conversations;
  }
}
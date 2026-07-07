import { join } from 'path';
import { Conversation, SyncResult } from './types';
import { OpenCodeStorage } from './opencode';
import { ensureDir, writeJsonFile } from './utils';
import { ISyncStorage, LocalSyncStorage } from './services/webdav-service';

export class SyncManager {
  private opencodeStorage: OpenCodeStorage;
  private syncStorage: ISyncStorage;

  constructor(opencodePath: string, syncPathOrStorage: string | ISyncStorage) {
    this.opencodeStorage = new OpenCodeStorage(opencodePath);
    this.syncStorage = typeof syncPathOrStorage === 'string'
      ? new LocalSyncStorage(syncPathOrStorage)
      : syncPathOrStorage;
  }

  async check(): Promise<SyncResult> {
    const localConversations = await this.opencodeStorage.getConversations();
    const syncConversations = await this.syncStorage.listConversations();

    const result: SyncResult = {
      needsPush: [],
      needsPull: [],
      upToDate: []
    };

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

    console.log(`Pushing ${result.needsPush.length} conversation(s) to ${this.syncStorage.name}...`);
    
    await this.syncStorage.ensureDir();

    for (const convId of result.needsPush) {
      const conversation = await this.opencodeStorage.getConversationData(convId);
      if (conversation) {
        await this.syncStorage.writeConversation(convId, conversation);
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

    console.log(`Pulling ${result.needsPull.length} conversation(s) from ${this.syncStorage.name}...`);

    for (const convId of result.needsPull) {
      try {
        const conversation = await this.syncStorage.readConversation(convId);
        await this.importConversation(conversation);
        console.log(`  ✓ Pulled: ${convId} (${conversation.metadata.title})`);
      } catch (error) {
        console.error(`  ✗ Failed to pull ${convId}:`, error);
      }
    }

    console.log('Pull completed successfully.');
  }

  private async importConversation(conversation: Conversation): Promise<void> {
    const importMarker = join(this.opencodeStorage.storagePath, 'sync_imported', `${conversation.id}.json`);
    await ensureDir(join(this.opencodeStorage.storagePath, 'sync_imported'));
    await writeJsonFile(importMarker, conversation);

    console.log(`  Imported conversation ${conversation.id} to local storage`);
  }
  
  // Static method for generic directory-to-directory sync
  static async syncDirectories(path1: string, path2: string): Promise<void> {
    const storage1 = new LocalSyncStorage(path1);
    const storage2 = new LocalSyncStorage(path2);
    
    const sync1to2 = new DirectorySync(storage1, storage2);
    const sync2to1 = new DirectorySync(storage2, storage1);
    
    const result1to2 = await sync1to2.check();
    const result2to1 = await sync2to1.check();
    
    if (result1to2.needsPush.length === 0 && result2to1.needsPush.length === 0) {
      console.log('No conversations need to be synced.');
      return;
    }
    
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

class DirectorySync {
  constructor(private source: ISyncStorage, private target: ISyncStorage) {}
  
  async check(): Promise<SyncResult> {
    const result: SyncResult = { needsPush: [], needsPull: [], upToDate: [] };
    
    try {
      const sourceConvs = await this.source.listConversations();
      const targetConvs = await this.target.listConversations();
      
      const allIds = new Set([...sourceConvs.keys(), ...targetConvs.keys()]);
      
      for (const id of allIds) {
        const src = sourceConvs.get(id) || 0;
        const tgt = targetConvs.get(id) || 0;
        if (src > tgt) result.needsPush.push(id);
        else if (tgt > src) result.needsPull.push(id);
        else if (src > 0) result.upToDate.push(id);
      }
    } catch (error) {
      console.warn('Warning: Could not check directory sync:', error);
    }
    
    return result;
  }
  
  async push(): Promise<void> {
    const result = await this.check();
    if (result.needsPush.length === 0) return;
    
    await this.target.ensureDir();
    
    for (const id of result.needsPush) {
      try {
        const conv = await this.source.readConversation(id);
        await this.target.writeConversation(id, conv);
        console.log(`  ✓ Pushed: ${id} (${conv.metadata.title})`);
      } catch (error) {
        console.error(`  ✗ Failed to push ${id}:`, error);
      }
    }
  }
}
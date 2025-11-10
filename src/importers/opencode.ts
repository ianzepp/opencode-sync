import { BaseImportStrategy } from '../import';
import { Conversation, ImportOptions, ImportResult } from '../types';
import { OpenCodeStorage } from '../opencode';
import { join } from 'path';
import { promises as fs } from 'fs';

export class OpenCodeImportStrategy extends BaseImportStrategy {
  format = 'opencode';

  async canImport(sourcePath: string): Promise<boolean> {
    try {
      // Check if this looks like OpenCode storage
      await fs.access(sourcePath);
      const stat = await fs.stat(sourcePath);
      
      if (!stat.isDirectory()) {
        return false;
      }

      // Check for key OpenCode directories
      const hasSessionDir = await fs.access(join(sourcePath, 'session'))
        .then(() => true).catch(() => false);
      const hasMessageDir = await fs.access(join(sourcePath, 'message'))
        .then(() => true).catch(() => false);

      return hasSessionDir || hasMessageDir;
    } catch {
      return false;
    }
  }

  async import(sourcePath: string, _options: ImportOptions = {}): Promise<ImportResult> {
    const storage = new OpenCodeStorage(sourcePath);
    const conversations = await storage.getConversations();
    const imported: Conversation[] = [];
    const warnings = [];

    for (const [convId, timestamp] of conversations) {
      try {
        const conversation = await storage.getConversationData(convId);
        if (conversation) {
          imported.push(conversation);
        }
      } catch (error) {
        warnings.push(this.createWarning(
          'conversion_error',
          `Failed to import conversation ${convId}: ${error}`,
          convId,
          { error }
        ));
      }
    }

    return this.createImportResult(imported, [], warnings, sourcePath);
  }
}
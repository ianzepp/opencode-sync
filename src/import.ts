import { Conversation, ImportResult, ImportStrategy, RawConversation, ImportWarning, ImportMetadata } from './types';
import { ensureDir, writeJsonFile } from './utils';
import { join } from 'path';
import { promises as fs } from 'fs';

export class ImportManager {
  private strategies: Map<string, ImportStrategy> = new Map();
  private archivePath: string;

  constructor(archivePath: string) {
    this.archivePath = archivePath;
  }

  getArchivePath(): string {
    return this.archivePath;
  }

  registerStrategy(strategy: ImportStrategy): void {
    this.strategies.set(strategy.format, strategy);
  }

  async importFrom(sourcePath: string, format: string): Promise<ImportResult> {
    const strategy = this.strategies.get(format);
    if (!strategy) {
      throw new Error(`Unsupported format: ${format}`);
    }

    if (!await strategy.canImport(sourcePath)) {
      throw new Error(`Cannot import from ${sourcePath} - format validation failed`);
    }

    return strategy.import(sourcePath);
  }

  async archiveConversation(raw: RawConversation, reason: string): Promise<string> {
    const archiveDir = join(this.archivePath, 'imported', raw.format);
    await ensureDir(archiveDir);
    
    const archiveFile = join(archiveDir, `${raw.id}-${Date.now()}.json`);
    const archiveData = {
      ...raw,
      archiveReason: reason,
      archivedAt: Date.now()
    };
    
    await writeJsonFile(archiveFile, archiveData);
    return archiveFile;
  }

  getSupportedFormats(): string[] {
    return Array.from(this.strategies.keys());
  }
}

export abstract class BaseImportStrategy implements ImportStrategy {
  abstract format: string;
  protected archivePath: string;

  constructor(archivePath: string) {
    this.archivePath = archivePath;
  }

  abstract canImport(sourcePath: string): Promise<boolean>;
  abstract import(sourcePath: string): Promise<ImportResult>;

  getFormat(): string {
    return this.format;
  }

  protected createImportResult(
    imported: Conversation[],
    archived: RawConversation[],
    warnings: ImportWarning[],
    sourcePath: string
  ): ImportResult {
    return {
      imported,
      archived,
      warnings,
      metadata: {
        format: this.format,
        sourcePath,
        timestamp: Date.now(),
        totalConversations: imported.length + archived.length,
        successfullyImported: imported.length,
        archivedCount: archived.length
      }
    };
  }

  protected createWarning(
    type: ImportWarning['type'],
    message: string,
    conversationId?: string,
    details?: any
  ): ImportWarning {
    return {
      type,
      message,
      conversationId,
      details
    };
  }
}
import { ImportManager } from '../import';
import { ImportFormatRegistry } from '../import-registry';
import { ImportResult, ImportStrategy } from '../types';
import { ClaudeImportStrategy } from '../importers/claude';
import { ChatGPTImportStrategy } from '../importers/chatgpt';
import chalk from 'chalk';

export class ImportService {
  private importManager: ImportManager;

  constructor(archivePath: string) {
    this.importManager = new ImportManager(archivePath);
    this.registerBuiltInFormats();
  }

  private registerBuiltInFormats(): void {
    // Register OpenCode format
    const opencodeStrategy = ImportFormatRegistry.create('opencode', this.importManager.getArchivePath());
    this.importManager.registerStrategy(opencodeStrategy);
    
    // Register Claude format
    const claudeStrategy = new ClaudeImportStrategy(this.importManager.getArchivePath());
    this.importManager.registerStrategy(claudeStrategy);
    
    // Register ChatGPT format
    const chatgptStrategy = new ChatGPTImportStrategy(this.importManager.getArchivePath());
    this.importManager.registerStrategy(chatgptStrategy);
  }

  async importFrom(sourcePath: string, format: string, preview: boolean = false): Promise<void> {
    if (!ImportFormatRegistry.isSupported(format)) {
      throw new Error(`Unsupported format: ${format}. Available formats: ${this.getAvailableFormats().join(', ')}`);
    }

    if (preview) {
      console.log(chalk.blue(`Previewing import from ${sourcePath} in ${format} format...`));
    } else {
      console.log(chalk.blue(`Importing from ${sourcePath} in ${format} format...`));
    }
    
    const result = await this.importManager.importFrom(sourcePath, format);
    
    if (preview) {
      this.displayPreviewResult(result);
    } else {
      this.displayImportResult(result);
    }
  }

  getAvailableFormats(): string[] {
    return ImportFormatRegistry.getAvailableFormats();
  }

  async detectFormat(sourcePath: string): Promise<string | null> {
    const formats = this.getAvailableFormats();
    
    for (const format of formats) {
      try {
        const strategy = this.getStrategyForFormat(format);
        if (await strategy.canImport(sourcePath)) {
          return format;
        }
      } catch {
        // Continue to next format
        continue;
      }
    }
    
    return null;
  }

  private getStrategyForFormat(format: string): ImportStrategy {
    // Try to get from registry first
    if (ImportFormatRegistry.isSupported(format)) {
      return ImportFormatRegistry.create(format, this.importManager.getArchivePath());
    }
    
    // Check if already registered in manager
    const supportedFormats = this.importManager.getSupportedFormats();
    if (supportedFormats.includes(format)) {
      // This is a bit of a hack - we need to get the strategy from the manager
      // For now, we'll recreate it since we know what formats we registered
      switch (format) {
        case 'opencode':
          return ImportFormatRegistry.create('opencode', this.importManager.getArchivePath());
        case 'claude':
          return new ClaudeImportStrategy(this.importManager.getArchivePath());
        case 'chatgpt':
          return new ChatGPTImportStrategy(this.importManager.getArchivePath());
        default:
          throw new Error(`Strategy for format ${format} not found`);
      }
    }
    
    throw new Error(`Unsupported format: ${format}`);
  }

  private displayImportResult(result: ImportResult): void {
    console.log(chalk.green('✓ Import completed!'));
    console.log(chalk.gray(`  Format: ${result.metadata.format}`));
    console.log(chalk.gray(`  Source: ${result.metadata.sourcePath}`));
    console.log(chalk.gray(`  Total conversations: ${result.metadata.totalConversations}`));
    console.log(chalk.green(`  Successfully imported: ${result.metadata.successfullyImported}`));
    
    if (result.metadata.archivedCount > 0) {
      console.log(chalk.yellow(`  Archived (unsupported): ${result.metadata.archivedCount}`));
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow(`  Warnings: ${result.warnings.length}`));
      result.warnings.slice(0, 3).forEach(warning => {
        console.log(chalk.gray(`    - ${warning.message}`));
      });
      if (result.warnings.length > 3) {
        console.log(chalk.gray(`    ... and ${result.warnings.length - 3} more`));
      }
    }
  }

  private displayPreviewResult(result: ImportResult): void {
    console.log(chalk.cyan('📋 Import Preview'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log(chalk.gray(`  Format: ${result.metadata.format}`));
    console.log(chalk.gray(`  Source: ${result.metadata.sourcePath}`));
    console.log(chalk.gray(`  Total conversations found: ${result.metadata.totalConversations}`));
    
    if (result.imported.length > 0) {
      console.log(chalk.green(`  ✓ Ready to import: ${result.imported.length} conversation(s)`));
      
      // Show first few conversations
      result.imported.slice(0, 3).forEach((conv, index) => {
        console.log(chalk.gray(`    ${index + 1}. ${conv.metadata.title}`));
        console.log(chalk.gray(`       ${conv.messages.length} messages, created: ${new Date(conv.metadata.created).toLocaleDateString()}`));
      });
      
      if (result.imported.length > 3) {
        console.log(chalk.gray(`    ... and ${result.imported.length - 3} more`));
      }
    }
    
    if (result.archived.length > 0) {
      console.log(chalk.yellow(`  ⚠ Would archive (unsupported): ${result.archived.length} conversation(s)`));
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow(`  ⚠ Potential issues: ${result.warnings.length}`));
      result.warnings.slice(0, 3).forEach(warning => {
        console.log(chalk.gray(`    - ${warning.message}`));
      });
      if (result.warnings.length > 3) {
        console.log(chalk.gray(`    ... and ${result.warnings.length - 3} more`));
      }
    }
    
    console.log(chalk.cyan('\nTo proceed with this import, run:'));
    console.log(chalk.gray(`  opencode-sync import --format ${result.metadata.format} ${result.metadata.sourcePath}`));
  }
}
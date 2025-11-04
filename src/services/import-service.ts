import { ImportManager } from '../import';
import { ImportFormatRegistry } from '../import-registry';
import { ImportResult } from '../types';
import chalk from 'chalk';

export class ImportService {
  private importManager: ImportManager;

  constructor(archivePath: string) {
    this.importManager = new ImportManager(archivePath);
    this.registerBuiltInFormats();
  }

  private registerBuiltInFormats(): void {
    const opencodeStrategy = ImportFormatRegistry.create('opencode', this.importManager.getArchivePath());
    this.importManager.registerStrategy(opencodeStrategy);
  }

  async importFrom(sourcePath: string, format: string): Promise<void> {
    if (!ImportFormatRegistry.isSupported(format)) {
      throw new Error(`Unsupported format: ${format}. Available formats: ${this.getAvailableFormats().join(', ')}`);
    }

    console.log(chalk.blue(`Importing from ${sourcePath} in ${format} format...`));
    
    const result = await this.importManager.importFrom(sourcePath, format);
    this.displayImportResult(result);
  }

  getAvailableFormats(): string[] {
    return ImportFormatRegistry.getAvailableFormats();
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
}
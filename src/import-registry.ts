import { ImportStrategy } from './types';
import { OpenCodeImportStrategy } from './importers/opencode';

export class ImportFormatRegistry {
  private static strategies: Map<string, new (archivePath: string) => ImportStrategy> = new Map();

  static {
    // Register built-in formats
    this.register('opencode', OpenCodeImportStrategy);
  }

  static register(format: string, strategy: new (archivePath: string) => ImportStrategy): void {
    this.strategies.set(format, strategy);
  }

  static create(format: string, archivePath: string): ImportStrategy {
    const StrategyClass = this.strategies.get(format);
    if (!StrategyClass) {
      throw new Error(`Unsupported format: ${format}. Available formats: ${this.getAvailableFormats().join(', ')}`);
    }
    const instance = new StrategyClass(archivePath);
    // Ensure the instance has the getFormat method
    if (!instance.getFormat) {
      instance.getFormat = () => format;
    }
    return instance;
  }

  static getAvailableFormats(): string[] {
    return Array.from(this.strategies.keys());
  }

  static isSupported(format: string): boolean {
    return this.strategies.has(format);
  }
}
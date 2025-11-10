import { BaseImportStrategy } from '../import';
import { ImportOptions, ImportResult, RawConversation, ImportWarning } from '../types';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils';
import { join, basename } from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';

interface ClaudeCodeImportManifest {
  workspaceHash: string;
  workspaceName: string;
  lastImport: number;
  files: ClaudeCodeFileInfo[];
}

interface ClaudeCodeFileInfo {
  originalSessionId: string;
  convertedSessionId: string;
  originalPath: string;
  importedPath: string;
  size: number;
  lastModified: number;
  importedAt: number;
}

interface FileMapping {
  workspaceHash: string;
  convertedSessionId: string;
  originalSessionId: string;
  workspaceName: string;
  targetPath: string;
  sourcePath: string;
}

export class ClaudeCodeRawImportStrategy extends BaseImportStrategy {
  format = 'claude-code-raw';
  private manifest: ClaudeCodeImportManifest | null = null;
  private manifestPath: string = '';

  async canImport(sourcePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        return false;
      }

      // Check if this looks like a Claude Code projects directory
      const files = await fs.readdir(sourcePath);
      
      // Look for workspace directories with .jsonl files
      for (const file of files) {
        const filePath = join(sourcePath, file);
        const fileStat = await fs.stat(filePath);
        
        if (fileStat.isDirectory()) {
          const subFiles = await fs.readdir(filePath);
          if (subFiles.some(f => f.endsWith('.jsonl'))) {
            return true;
          }
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  async import(sourcePath: string, options: ImportOptions = {}): Promise<ImportResult> {
    const warnings: ImportWarning[] = [];
    const archived: RawConversation[] = [];
    const force = Boolean(options.force);
    
    try {
      console.log(`Scanning Claude Code directory: ${sourcePath}`);
      if (force) {
        console.log('Force flag detected - re-importing all Claude Code files.');
      }
      
      // Find all .jsonl files in workspace directories
      const claudeFiles = await this.scanClaudeCodeFiles(sourcePath);
      
      if (claudeFiles.length === 0) {
        warnings.push(this.createWarning(
          'conversion_error',
          'No Claude Code conversation files found in the specified directory'
        ));
        
        return this.createImportResult([], archived, warnings, sourcePath);
      }

      const filesByWorkspace = this.groupFilesByWorkspace(claudeFiles);

      for (const [workspaceSlug, files] of filesByWorkspace) {
        try {
          await this.prepareWorkspaceManifest(workspaceSlug);
        } catch (error) {
          warnings.push(this.createWarning(
            'conversion_error',
            `Failed to load manifest for workspace ${workspaceSlug}: ${error}`,
            undefined,
            { workspace: workspaceSlug, error }
          ));
          continue;
        }

        const filesToImport = force ? files : files.filter(file => this.isNewOrModified(file));
        console.log(`Workspace ${workspaceSlug}: ${files.length} files found, ${filesToImport.length} to import`);

        for (const file of filesToImport) {
          try {
            await this.importClaudeCodeFile(file);
            const mapping = this.mapClaudeCodeToOpenCodePath(file);

            archived.push({
              id: mapping.convertedSessionId,
              format: this.format,
              rawData: {
                originalPath: file.path,
                importedPath: mapping.targetPath,
                workspace: mapping.workspaceName,
                sessionId: file.sessionId,
                size: file.size,
                lastModified: file.lastModified
              },
              filePath: mapping.targetPath,
              timestamp: Date.now()
            });
          } catch (error) {
            warnings.push(this.createWarning(
              'conversion_error',
              `Failed to import ${file.path}: ${error}`,
              undefined,
              { file: file.path, error }
            ));
          }
        }

        await this.saveManifest();
        this.manifest = null;
        this.manifestPath = '';
      }

      return this.createImportResult([], archived, warnings, sourcePath);
    } catch (error) {
      warnings.push(this.createWarning(
        'conversion_error',
        `Failed to import Claude Code data: ${error}`,
        undefined,
        { sourcePath, error }
      ));
      
      return this.createImportResult([], archived, warnings, sourcePath);
    }
  }

  private async scanClaudeCodeFiles(sourcePath: string): Promise<ClaudeCodeRawFileInfo[]> {
    const files: ClaudeCodeRawFileInfo[] = [];
    
    try {
      const workspaceDirs = await fs.readdir(sourcePath);
      
      for (const workspaceDir of workspaceDirs) {
        const workspacePath = join(sourcePath, workspaceDir);
        const workspaceStat = await fs.stat(workspacePath);
        
        if (workspaceStat.isDirectory() && workspaceDir.startsWith('-')) {
          const jsonlFiles = await fs.readdir(workspacePath);
          
          for (const file of jsonlFiles) {
            if (file.endsWith('.jsonl')) {
              const filePath = join(workspacePath, file);
              const fileStat = await fs.stat(filePath);
              const sessionId = file.replace('.jsonl', '');
              
              files.push({
                path: filePath,
                workspacePath: workspaceDir,
                sessionId,
                size: fileStat.size,
                lastModified: fileStat.mtime.getTime()
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Error scanning directory ${sourcePath}:`, error);
    }
    
    return files.sort((a, b) => a.lastModified - b.lastModified);
  }

  private groupFilesByWorkspace(files: ClaudeCodeRawFileInfo[]): Map<string, ClaudeCodeRawFileInfo[]> {
    const grouped = new Map<string, ClaudeCodeRawFileInfo[]>();

    for (const file of files) {
      if (!grouped.has(file.workspacePath)) {
        grouped.set(file.workspacePath, []);
      }
      grouped.get(file.workspacePath)!.push(file);
    }

    return grouped;
  }

  private async prepareWorkspaceManifest(workspaceSlug: string): Promise<void> {
    const workspaceHash = this.generateWorkspaceHash(workspaceSlug);
    this.manifestPath = join(this.archivePath, 'imported', 'claude-code-raw', workspaceHash, 'manifest.json');
    this.manifest = await this.loadManifest();

    if (!this.manifest) {
      this.manifest = this.createNewManifest(workspaceSlug);
    }
  }

  private mapClaudeCodeToOpenCodePath(file: ClaudeCodeRawFileInfo): FileMapping {
    const filename = basename(file.path);
    const sessionId = filename.replace('.jsonl', '');
    const workspaceHash = this.generateWorkspaceHash(file.workspacePath);
    const convertedSessionId = this.convertSessionId(sessionId);

    return {
      workspaceHash,
      convertedSessionId,
      originalSessionId: sessionId,
      workspaceName: file.workspacePath.replace(/^-/, '').replace(/-/g, '/'),
      targetPath: join('imported', 'claude-code-raw', workspaceHash, `${convertedSessionId}.jsonl`),
      sourcePath: file.path
    };
  }

  private generateWorkspaceHash(workspacePath: string): string {
    return createHash('sha1')
      .update(`claude-workspace-${workspacePath}`)
      .digest('hex')
      .substring(0, 40);
  }

  private convertSessionId(sessionId: string): string {
    return createHash('sha1')
      .update(`claude-session-${sessionId}`)
      .digest('hex')
      .substring(0, 40);
  }

  private async importClaudeCodeFile(file: ClaudeCodeRawFileInfo): Promise<void> {
    const mapping = this.mapClaudeCodeToOpenCodePath(file);
    const targetDir = join(this.archivePath, 'imported', 'claude-code-raw', mapping.workspaceHash);
    const targetPath = join(this.archivePath, mapping.targetPath);
    
    // Ensure target directory exists
    await ensureDir(targetDir);
    
    // Copy the file
    await fs.copyFile(file.path, targetPath);
    
    console.log(`Imported: ${file.path} → ${mapping.targetPath}`);
    
    // Update manifest
    this.updateManifestFile(mapping, file);
  }

  private updateManifestFile(mapping: FileMapping, file: ClaudeCodeRawFileInfo): void {
    if (!this.manifest) return;
    
    // Remove existing entry if present
    this.manifest.files = this.manifest.files.filter(f => f.originalPath !== file.path);
    
    // Add new entry
    this.manifest.files.push({
      originalSessionId: mapping.originalSessionId,
      convertedSessionId: mapping.convertedSessionId,
      originalPath: file.path,
      importedPath: mapping.targetPath,
      size: file.size,
      lastModified: file.lastModified,
      importedAt: Date.now()
    });
    
    this.manifest.lastImport = Date.now();
  }

  private isNewOrModified(file: ClaudeCodeRawFileInfo): boolean {
    if (!this.manifest) return true;
    
    const existing = this.manifest.files.find(f => f.originalPath === file.path);
    return !existing || existing.lastModified < file.lastModified;
  }

  private async loadManifest(): Promise<ClaudeCodeImportManifest | null> {
    try {
      const data = await readJsonFile<ClaudeCodeImportManifest>(this.manifestPath);
      return data;
    } catch {
      return null;
    }
  }

  private createNewManifest(workspacePath: string): ClaudeCodeImportManifest {
    return {
      workspaceHash: this.generateWorkspaceHash(workspacePath),
      workspaceName: workspacePath.replace(/^-/, '').replace(/-/g, '/'),
      lastImport: 0,
      files: []
    };
  }

  private async saveManifest(): Promise<void> {
    if (!this.manifest) return;
    
    await ensureDir(join(this.archivePath, 'imported', 'claude-code-raw', this.manifest.workspaceHash));
    await writeJsonFile(this.manifestPath, this.manifest);
  }
}

interface ClaudeCodeRawFileInfo {
  path: string;
  workspacePath: string;
  sessionId: string;
  size: number;
  lastModified: number;
}
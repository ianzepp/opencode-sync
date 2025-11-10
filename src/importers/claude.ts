import { BaseImportStrategy } from '../import';
import { Conversation, ImportOptions, ImportResult, Message, RawConversation, ImportWarning } from '../types';
import { readJsonFile } from '../utils';
import { join } from 'path';
import { promises as fs } from 'fs';

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  messages: ClaudeMessage[];
  project?: {
    uuid: string;
    name: string;
  };
}

interface ClaudeMessage {
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  model?: string;
}

export class ClaudeImportStrategy extends BaseImportStrategy {
  format = 'claude';

  async canImport(sourcePath: string): Promise<boolean> {
    try {
      // Check if it's a directory with Claude conversations
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        return false;
      }

      // Look for Claude conversation files
      const files = await fs.readdir(sourcePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(sourcePath, file);
          try {
            const content = await readJsonFile<any>(filePath);
            // Check for Claude-specific structure
            if (this.isClaudeConversation(content)) {
              return true;
            }
          } catch {
            // Continue to next file
            continue;
          }
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  async import(sourcePath: string, _options: ImportOptions = {}): Promise<ImportResult> {
    const imported: Conversation[] = [];
    const archived: RawConversation[] = [];
    const warnings: ImportWarning[] = [];


    try {
      const files = await fs.readdir(sourcePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(sourcePath, file);
          
          try {
            const claudeConv = await readJsonFile<ClaudeConversation>(filePath);
            
            if (this.isClaudeConversation(claudeConv)) {
              const result = this.convertClaudeToOpenCode(claudeConv, filePath);
              
              if (result.conversation) {
                imported.push(result.conversation);
                
                // Add warnings for any issues during conversion
                warnings.push(...result.warnings);
              } else {
                // Archive if conversion failed completely
                archived.push({
                  id: claudeConv.uuid,
                  format: this.format,
                  rawData: claudeConv,
                  filePath,
                  timestamp: new Date(claudeConv.created_at).getTime()
                });
                
                warnings.push(this.createWarning(
                  'conversion_error',
                  `Failed to convert Claude conversation ${claudeConv.uuid}`,
                  claudeConv.uuid
                ));
              }
            }
          } catch (error) {
            warnings.push(this.createWarning(
              'conversion_error',
              `Failed to read Claude file ${file}: ${error}`,
              undefined,
              { file, error }
            ));
          }
        }
      }
    } catch (error) {
      warnings.push(this.createWarning(
        'conversion_error',
        `Failed to scan directory ${sourcePath}: ${error}`,
        undefined,
        { sourcePath, error }
      ));
    }

    return this.createImportResult(imported, archived, warnings, sourcePath);
  }

  private isClaudeConversation(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      typeof obj.uuid === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.created_at === 'string' &&
      Array.isArray(obj.messages) &&
      obj.messages.length > 0 &&
      this.isClaudeMessage(obj.messages[0])
    );
  }

  private isClaudeMessage(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      typeof obj.uuid === 'string' &&
      (obj.role === 'user' || obj.role === 'assistant') &&
      typeof obj.content === 'string' &&
      typeof obj.created_at === 'string'
    );
  }

  private convertClaudeToOpenCode(claude: ClaudeConversation, filePath: string): { 
    conversation: Conversation | null; 
    warnings: ImportWarning[] 
  } {
    const warnings: ImportWarning[] = [];
    
    try {
      const messages: Message[] = claude.messages.map(msg => this.convertClaudeMessage(msg));
      
      // Handle project information
      let project = 'imported-claude';
      let directory = '';
      
      if (claude.project?.name) {
        project = this.sanitizeProjectName(claude.project.name);
        directory = claude.project.name;
      }

      // Handle Claude-specific features that don't map to OpenCode
      if (claude.messages.some(msg => msg.model)) {
        warnings.push(this.createWarning(
          'metadata_loss',
          'Claude model information preserved in raw data but not in OpenCode format',
          claude.uuid
        ));
      }

      const conversation: Conversation = {
        id: claude.uuid,
        metadata: {
          title: claude.name || 'Untitled Claude Conversation',
          project,
          directory,
          created: new Date(claude.created_at).getTime(),
          updated: new Date(claude.updated_at).getTime(),
          machine: 'imported-claude'
        },
        messages
      };

      return { conversation, warnings };
    } catch (error) {
      warnings.push(this.createWarning(
        'conversion_error',
        `Failed to convert Claude conversation structure: ${error}`,
        claude.uuid,
        { error }
      ));
      
      return { conversation: null, warnings };
    }
  }

  private convertClaudeMessage(claudeMsg: ClaudeMessage): Message {
    return {
      id: claudeMsg.uuid,
      sessionID: claudeMsg.uuid, // Using message UUID as session ID for uniqueness
      role: claudeMsg.role,
      time: {
        created: new Date(claudeMsg.created_at).getTime()
      },
      summary: {
        title: this.extractTitle(claudeMsg.content),
        body: this.truncateContent(claudeMsg.content, 200)
      }
    };
  }

  private extractTitle(content: string): string {
    // Extract first line or first 50 characters as title
    const firstLine = content.split('\n')[0];
    return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  private sanitizeProjectName(name: string): string {
    // Convert to valid project name (alphanumeric, hyphens, underscores)
    return name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  }
}
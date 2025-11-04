import { BaseImportStrategy } from '../import';
import { Conversation, ImportResult, Message, RawConversation, ImportWarning } from '../types';
import { readJsonFile } from '../utils';
import { join } from 'path';
import { promises as fs } from 'fs';

interface ChatGPTConversation {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, any>;
}

export class ChatGPTImportStrategy extends BaseImportStrategy {
  format = 'chatgpt';

  async canImport(sourcePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        return false;
      }

      const files = await fs.readdir(sourcePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(sourcePath, file);
          try {
            const content = await readJsonFile<any>(filePath);
            if (this.isChatGPTConversation(content)) {
              return true;
            }
          } catch {
            continue;
          }
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  async import(sourcePath: string): Promise<ImportResult> {
    const imported: Conversation[] = [];
    const warnings: ImportWarning[] = [];

    try {
      const files = await fs.readdir(sourcePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(sourcePath, file);
          
          try {
            const chatgptConv = await readJsonFile<ChatGPTConversation>(filePath);
            
            if (this.isChatGPTConversation(chatgptConv)) {
              const conversation = this.convertChatGPTToOpenCode(chatgptConv);
              
              if (conversation) {
                imported.push(conversation);
              }
            }
          } catch (error) {
            warnings.push(this.createWarning(
              'conversion_error',
              `Failed to read ChatGPT file ${file}: ${error}`
            ));
          }
        }
      }
    } catch (error) {
      warnings.push(this.createWarning(
        'conversion_error',
        `Failed to scan directory ${sourcePath}: ${error}`
      ));
    }

    return this.createImportResult(imported, [], warnings, sourcePath);
  }

  private isChatGPTConversation(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      typeof obj.id === 'string' &&
      typeof obj.title === 'string' &&
      typeof obj.create_time === 'number' &&
      typeof obj.mapping === 'object'
    );
  }

  private convertChatGPTToOpenCode(chatgpt: ChatGPTConversation): Conversation | null {
    try {
      const messages = this.extractMessages(chatgpt);
      
      if (messages.length === 0) {
        return null;
      }

      return {
        id: chatgpt.id,
        metadata: {
          title: chatgpt.title || 'Untitled ChatGPT Conversation',
          project: 'imported-chatgpt',
          directory: '',
          created: chatgpt.create_time * 1000,
          updated: chatgpt.update_time * 1000,
          machine: 'imported-chatgpt'
        },
        messages
      };
    } catch {
      return null;
    }
  }

  private extractMessages(chatgpt: ChatGPTConversation): Message[] {
    const messages: Message[] = [];
    
    for (const nodeId in chatgpt.mapping) {
      const node = chatgpt.mapping[nodeId];
      
      if (node?.message?.author?.role && node.message.content?.parts) {
        const role = node.message.author.role;
        
        // Skip system messages
        if (role === 'system') {
          continue;
        }
        
        const content = node.message.content.parts.join('\n');
        
        if (content.trim()) {
          messages.push({
            id: node.message.id,
            sessionID: chatgpt.id,
            role: role as 'user' | 'assistant',
            time: {
              created: (node.message.create_time || chatgpt.create_time) * 1000
            },
            summary: {
              title: this.extractTitle(content),
              body: this.truncateContent(content, 200)
            }
          });
        }
      }
    }
    
    return messages.sort((a, b) => a.time.created - b.time.created);
  }

  private extractTitle(content: string): string {
    const firstLine = content.split('\n')[0];
    return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }
}
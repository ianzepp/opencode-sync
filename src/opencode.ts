import { promises as fs } from 'fs';
import { join } from 'path';
import { Conversation, Message } from './types';
import { readJsonFile, ensureDir } from './utils';

export class OpenCodeStorage {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async getConversations(): Promise<Map<string, number>> {
    const conversations = new Map<string, number>();
    
    try {
      // Scan session directories
      const sessionDir = join(this.storagePath, 'session');
      const projectDirs = await fs.readdir(sessionDir);

      for (const projectDir of projectDirs) {
        const projectPath = join(sessionDir, projectDir);
        const stat = await fs.stat(projectPath);
        
        if (stat.isDirectory()) {
          const sessionFiles = await fs.readdir(projectPath);
          
          for (const sessionFile of sessionFiles) {
            if (sessionFile.endsWith('.json')) {
              const sessionId = sessionFile.replace('.json', '');
              const sessionPath = join(projectPath, sessionFile);
              
              try {
                const sessionData = await readJsonFile<any>(sessionPath);
                const updated = sessionData.time?.updated || sessionData.time?.created || 0;
                conversations.set(sessionId, updated);
              } catch (error) {
                console.warn(`Warning: Could not read session ${sessionId}:`, error);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Warning: Could not scan OpenCode storage:', error);
    }

    return conversations;
  }

  async getConversationData(conversationId: string): Promise<Conversation | null> {
    try {
      // Find the session file
      const sessionDir = join(this.storagePath, 'session');
      const projectDirs = await fs.readdir(sessionDir);

      for (const projectDir of projectDirs) {
        const projectPath = join(sessionDir, projectDir);
        const sessionPath = join(projectPath, `${conversationId}.json`);
        
        try {
          await fs.access(sessionPath);
          const sessionData = await readJsonFile<any>(sessionPath);
          
          // Get messages for this conversation
          const messages = await this.getMessages(conversationId);
          
          return {
            id: conversationId,
            metadata: {
              title: sessionData.title || 'Untitled',
              project: sessionData.projectID || 'unknown',
              directory: sessionData.directory || '',
              created: sessionData.time?.created || 0,
              updated: sessionData.time?.updated || sessionData.time?.created || 0,
              machine: require('os').hostname()
            },
            messages
          };
        } catch (error) {
          // Session file not found in this project, continue searching
          continue;
        }
      }
    } catch (error) {
      console.error(`Error reading conversation ${conversationId}:`, error);
    }
    
    return null;
  }

  private async getMessages(conversationId: string): Promise<Message[]> {
    const messages: Message[] = [];
    
    try {
      const messagesDir = join(this.storagePath, 'message', conversationId);
      
      try {
        await fs.access(messagesDir);
        const messageFiles = await fs.readdir(messagesDir);
        
        for (const messageFile of messageFiles) {
          if (messageFile.endsWith('.json')) {
            const messagePath = join(messagesDir, messageFile);
            
            try {
              const messageData = await readJsonFile<any>(messagePath);
              messages.push(messageData);
            } catch (error) {
              console.warn(`Warning: Could not read message ${messageFile}:`, error);
            }
          }
        }
        
        // Sort messages by timestamp
        messages.sort((a, b) => a.time.created - b.time.created);
      } catch (error) {
        // Messages directory doesn't exist, return empty array
      }
    } catch (error) {
      console.warn(`Warning: Could not scan messages for ${conversationId}:`, error);
    }
    
    return messages;
  }
}
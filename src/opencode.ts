import Database from 'better-sqlite3';
import { basename, join } from 'path';
import { Conversation, Message } from './types';

export class OpenCodeStorage {
  private db: Database.Database;
  readonly storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    const dbPath = join(storagePath, '..', 'opencode.db');
    this.db = new Database(dbPath, { readonly: true });
    this.db.pragma('journal_mode = WAL');
  }

  close(): void {
    this.db.close();
  }

  async getConversations(): Promise<Map<string, number>> {
    const conversations = new Map<string, number>();

    try {
      const rows = this.db.prepare(
        'SELECT id, time_updated FROM session ORDER BY time_updated DESC'
      ).all() as { id: string; time_updated: number }[];

      for (const row of rows) {
        conversations.set(row.id, row.time_updated);
      }
    } catch (error) {
      console.warn('Warning: Could not query sessions:', error);
    }

    return conversations;
  }

  async getConversationData(conversationId: string): Promise<Conversation | null> {
    try {
      const session = this.db.prepare(`
        SELECT s.*, p.worktree AS project_worktree
        FROM session s
        LEFT JOIN project p ON p.id = s.project_id
        WHERE s.id = ?
      `).get(conversationId) as any;

      if (!session) return null;

      const messages = await this.getMessages(conversationId);

      return {
        id: session.id,
        metadata: {
          title: session.title || 'Untitled',
          project: session.directory ? basename(session.directory.replace(/\\/g, '/')) : session.slug || 'unknown',
          directory: session.directory || '',
          created: session.time_created,
          updated: session.time_updated,
          machine: require('os').hostname()
        },
        messages
      };
    } catch (error) {
      console.error(`Error reading conversation ${conversationId}:`, error);
    }

    return null;
  }

  private async getMessages(conversationId: string): Promise<Message[]> {
    const messages: Message[] = [];

    try {
      const rows = this.db.prepare(`
        SELECT m.id, m.time_created,
               json_extract(m.data, '$.role') AS role,
               json_extract(m.data, '$.parentID') AS parentID
        FROM message m
        WHERE m.session_id = ?
        ORDER BY m.time_created
      `).all(conversationId) as any[];

      const getParts = this.db.prepare(`
        SELECT data FROM part
        WHERE message_id = ?
        ORDER BY time_created
      `);

      for (const row of rows) {
        const rawParts = getParts.all(row.id) as { data: string }[];
        const parts = rawParts.map(p => JSON.parse(p.data));

        const reasoning = parts.filter(p => p.type === 'reasoning').map(p => p.text || '').join('\n');
        const text = parts.filter(p => p.type === 'text').map(p => p.text || '').join('\n');
        const tools = parts.filter(p => p.type === 'tool');

        const toolLines = tools.map(t => {
          const name = t.tool || 'unknown';
          const status = t.state?.status || '';
          const input = t.state?.input || {};
          const inputSummary = JSON.stringify(input).substring(0, 120);
          return `  🛠 ${name} ${inputSummary} → ${status}`;
        }).join('\n');

        const bodyParts: string[] = [];
        if (reasoning) bodyParts.push(`[思考]\n${reasoning}`);
        if (text) bodyParts.push(`[回复]\n${text}`);
        if (toolLines) bodyParts.push(`[工具]\n${toolLines}`);

        messages.push({
          id: row.id,
          sessionID: conversationId,
          role: row.role === 'assistant' ? 'assistant' : 'user',
          time: { created: row.time_created },
          summary: {
            body: bodyParts.join('\n\n').substring(0, 10000)
          }
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not get messages for ${conversationId}:`, error);
    }

    return messages;
  }
}

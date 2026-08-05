import Database from 'better-sqlite3';
import { BaseImportStrategy } from '../import';
import { Conversation, ImportOptions, ImportResult, Message, RawConversation, ImportWarning } from '../types';
import { readJsonFile } from '../utils';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

interface CodexThread {
  id: string;
  title: string;
  rollout_path: string;
  created_at_ms: number;
  updated_at_ms: number;
  cwd: string;
  model: string;
  model_provider: string;
  source: string;
  preview: string;
  agent_nickname: string | null;
  agent_role: string | null;
  tokens_used: number;
}

interface JSONLEvent {
  timestamp: string;
  type: string;
  payload: any;
}

interface ParsedMessage {
  turnId: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  msgId?: string;
}

export class CodexCLIImportStrategy extends BaseImportStrategy {
  format = 'codex-cli';

  async canImport(sourcePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) return false;

      const files = await fs.readdir(sourcePath);
      const hasStateDb = files.some(f => f.startsWith('state_') && f.endsWith('.sqlite'));
      const hasSessionsDir = files.some(f => f === 'sessions');

      if (!hasStateDb || !hasSessionsDir) return false;

      const dbFile = files.find(f => f.startsWith('state_') && f.endsWith('.sqlite'));
      if (!dbFile) return false;

      const db = new Database(join(sourcePath, dbFile), { readonly: true });
      try {
        const tableCount = db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='threads'").get() as any;
        return tableCount.cnt > 0;
      } finally {
        db.close();
      }
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
      const dbFile = files.find(f => f.startsWith('state_') && f.endsWith('.sqlite'));
      if (!dbFile) {
        warnings.push(this.createWarning('conversion_error', 'No state_*.sqlite database found in codex directory'));
        return this.createImportResult(imported, archived, warnings, sourcePath);
      }

      const dbPath = join(sourcePath, dbFile);
      const threads = await this.getThreads(dbPath);

      for (const thread of threads) {
        try {
          const conv = await this.convertThreadToConversation(thread, sourcePath);
          if (conv) {
            imported.push(conv);
          } else {
            archived.push({
              id: thread.id,
              format: this.format,
              rawData: thread,
              filePath: thread.rollout_path,
              timestamp: thread.created_at_ms
            });
          }
        } catch (error) {
          warnings.push(this.createWarning(
            'conversion_error',
            `Failed to convert thread ${thread.id}: ${error}`,
            thread.id,
            { error: String(error) }
          ));
        }
      }
    } catch (error) {
      warnings.push(this.createWarning(
        'conversion_error',
        `Failed to scan codex directory ${sourcePath}: ${error}`,
        undefined,
        { sourcePath, error: String(error) }
      ));
    }

    return this.createImportResult(imported, archived, warnings, sourcePath);
  }

  private async getThreads(dbPath: string): Promise<CodexThread[]> {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db.prepare(`
        SELECT id, title, rollout_path, created_at_ms, updated_at_ms,
               cwd, model, model_provider, source, preview,
               agent_nickname, agent_role, tokens_used
        FROM threads
        WHERE archived = 0
        ORDER BY created_at_ms DESC
      `).all() as CodexThread[];
    } finally {
      db.close();
    }
  }

  private async convertThreadToConversation(thread: CodexThread, codexPath: string): Promise<Conversation | null> {
    const jsonlPath = thread.rollout_path;

    try {
      await fs.access(jsonlPath);
    } catch {
      return null;
    }

    const messages = await this.parseJSONLMessages(jsonlPath);
    if (messages.length === 0) return null;

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const project = thread.cwd ? thread.cwd.split(/[\\/]/).pop() || 'codex' : 'codex';

    return {
      id: thread.id,
      metadata: {
        title: thread.title || 'Untitled',
        project,
        directory: thread.cwd || '',
        created: thread.created_at_ms,
        updated: thread.updated_at_ms || thread.created_at_ms,
        machine: os.hostname()
      },
      messages: messages.map((m, i) => ({
        id: m.msgId || `${thread.id}-msg-${i}`,
        sessionID: thread.id,
        role: m.role,
        time: { created: m.timestamp },
        summary: {
          body: m.text.substring(0, 10000)
        }
      }))
    };
  }

  private async parseJSONLMessages(jsonlPath: string): Promise<ParsedMessage[]> {
    const content = await fs.readFile(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n');

    const responseMessages: ParsedMessage[] = [];
    const eventMessages: ParsedMessage[] = [];

    for (const line of lines) {
      try {
        const event: JSONLEvent = JSON.parse(line);

        if (event.type === 'response_item' && event.payload?.role) {
          const role = event.payload.role;
          const turnId = event.payload.internal_chat_message_metadata_passthrough?.turn_id ||
                         event.payload.turn_id || '';

          if (role === 'user' || role === 'assistant') {
            const text = this.extractTextFromContent(event.payload.content);
            const timestamp = new Date(event.timestamp).getTime();
            const msgId = event.payload.id || '';

            if (text && this.isRealMessage(text)) {
              responseMessages.push({ turnId, role, text, timestamp, msgId });
            }
          }
        } else if (event.type === 'event_msg') {
          const payload = event.payload;
          if (payload.type === 'user_message' && payload.message) {
            const timestamp = new Date(event.timestamp).getTime();
            if (this.isRealMessage(payload.message)) {
              eventMessages.push({ turnId: '', role: 'user', text: payload.message, timestamp, msgId: '' });
            }
          } else if (payload.type === 'agent_message' && payload.message) {
            const timestamp = new Date(event.timestamp).getTime();
            if (this.isRealMessage(payload.message)) {
              eventMessages.push({ turnId: '', role: 'assistant', text: payload.message, timestamp, msgId: '' });
            }
          }
        }
      } catch {
        continue;
      }
    }

    const messages = [...responseMessages];
    for (const em of eventMessages) {
      if (!this.hasNearbyMessage(messages, em.role, em.timestamp, 3000)) {
        messages.push(em);
      }
    }

    return messages;
  }

  private extractTextFromContent(content: any[]): string {
    if (!Array.isArray(content)) return '';

    return content
      .filter(c => c.type === 'input_text' || c.type === 'output_text')
      .map(c => c.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private isRealMessage(text: string): boolean {
    const systemPrefixes = ['<environment_context>', '<permissions instructions>', '<multi_agent_mode>'];
    return !systemPrefixes.some(p => text.startsWith(p));
  }

  private hasNearbyMessage(messages: ParsedMessage[], role: string, timestamp: number, windowMs: number): boolean {
    return messages.some(m => m.role === role && Math.abs(m.timestamp - timestamp) < windowMs);
  }
}

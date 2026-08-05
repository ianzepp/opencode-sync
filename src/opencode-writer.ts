import Database from 'better-sqlite3';
import { Conversation } from './types';
import { randomUUID } from 'crypto';

const VERSION = '0.144.6';
const EMPTY_SANDBOXES = '[]';

function generateId(prefix: string): string {
  return prefix + randomUUID().replace(/-/g, '');
}

function generateSlug(): string {
  const adj = ['neon', 'sunny', 'jolly', 'shiny', 'cosmic', 'brave', 'crimson', 'frosty', 'gentle', 'hidden',
    'ivory', 'keen', 'lively', 'misty', 'noble', 'odd', 'plain', 'quaint', 'rapid', 'sharp', 'tame', 'ultra', 'vivid'];
  const noun = ['nebula', 'star', 'island', 'otter', 'wolf', 'panda', 'fox', 'bear', 'eagle', 'hawk',
    'lion', 'tiger', 'deer', 'moth', 'swan', 'koala', 'owl', 'ray', 'wren', 'elk', 'dove', 'newt', 'bat'];
  return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}`;
}

export class OpenCodeWriter {
  private db: Database.Database;
  private sessionPathColumn: 'directory' | 'path';

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    const columns = this.db.prepare('PRAGMA table_info(session)').all() as { name: string }[];
    this.sessionPathColumn = columns.some(c => c.name === 'directory') ? 'directory' : 'path';
  }

  close(): void {
    this.db.close();
  }

  conversationExists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM session WHERE id = ?').get(id);
    return !!row;
  }

  writeConversation(conv: Conversation, agent = 'opencode'): string | null {
    if (this.conversationExists(conv.id)) {
      this.markConversationAgent(conv.id, agent);
      return null;
    }

    const projectId = this.ensureProject(conv.metadata.directory);
    const sessionId = conv.id;
    const now = conv.metadata.updated || conv.metadata.created;

    this.db.prepare(`
      INSERT INTO session (id, project_id, slug, ${this.sessionPathColumn}, title, version, time_created, time_updated, agent, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      projectId,
      generateSlug(),
      conv.metadata.directory || '',
      conv.metadata.title || 'Untitled',
      VERSION,
      conv.metadata.created || now,
      now,
      agent,
      ''
    );

    for (const msg of conv.messages) {
      const msgId = generateId('msg_');
      const msgData = JSON.stringify({
        role: msg.role,
        time: { created: msg.time.created },
        summary: msg.summary?.body ? { body: msg.summary.body.substring(0, 200) } : {}
      });

      this.db.prepare(`
        INSERT INTO message (id, session_id, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?)
      `).run(msgId, sessionId, msg.time.created, msg.time.created, msgData);

      const body = msg.summary?.body || '';
      if (body) {
        const partId = generateId('prt_');
        const partData = JSON.stringify({ type: 'text', text: body });

        this.db.prepare(`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(partId, msgId, sessionId, msg.time.created, msg.time.created, partData);
      }
    }

    return sessionId;
  }

  markConversationAgent(id: string, agent: string): void {
    this.db.prepare('UPDATE session SET agent = ? WHERE id = ?').run(agent, id);
  }

  private ensureProject(directory: string): string {
    if (!directory) return 'global';

    const existing = this.db.prepare('SELECT id FROM project WHERE worktree = ?').get(directory) as any;
    if (existing) return existing.id;

    const id = generateId('');
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO project (id, worktree, name, time_created, time_updated, sandboxes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, directory, directory.split(/[\\/]/).pop() || 'project', now, now, EMPTY_SANDBOXES);

    return id;
  }

  getStats(): { sessions: number; messages: number; parts: number } {
    const s = this.db.prepare("SELECT COUNT(*) as c FROM session").get() as any;
    const m = this.db.prepare("SELECT COUNT(*) as c FROM message").get() as any;
    const p = this.db.prepare("SELECT COUNT(*) as c FROM part").get() as any;
    return { sessions: s.c, messages: m.c, parts: p.c };
  }
}

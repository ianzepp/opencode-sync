import Database from 'better-sqlite3';
import { basename } from 'path';
import { join } from 'path';

export interface SearchResult {
  sessionId: string;
  title: string;
  snippet: string;
  score: number;
  source?: string;
}

export interface SearchFilters {
  source?: 'opencode' | 'codex';
  project?: string;
}

export class SearchIndex {
  private indexDb: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.indexDb = new Database(dbPath);
    this.indexDb.pragma('journal_mode = WAL');
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.indexDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS conv_fts USING fts5(
        session_id UNINDEXED,
        title,
        content,
        messages_count,
        source UNINDEXED,
        project UNINDEXED,
        tokenize='unicode61'
      );
    `);
  }

  rebuild(sourceDbPath: string): { total: number; duration: number } {
    const start = Date.now();
    const source = new Database(sourceDbPath, { readonly: true });

    this.indexDb.exec('DELETE FROM conv_fts');

    const insert = this.indexDb.prepare(
      'INSERT INTO conv_fts (session_id, title, content, messages_count, source, project) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const sessionColumns = source.prepare('PRAGMA table_info(session)').all() as { name: string }[];
    const sessionPathColumn = sessionColumns.some(c => c.name === 'directory') ? 'directory' : 'path';

    const rows = source.prepare(`
      SELECT s.id, s.title, s.${sessionPathColumn} AS session_path,
             p.worktree AS project_worktree,
             CASE WHEN LOWER(COALESCE(s.agent, '')) = 'codex' THEN 'codex' ELSE 'opencode' END AS source,
             COUNT(DISTINCT m.id) AS msg_count
      FROM session s
      LEFT JOIN project p ON p.id = s.project_id
      JOIN message m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.time_created DESC
    `).all() as {
      id: string;
      title: string;
      session_path: string | null;
      project_worktree: string | null;
      source: 'opencode' | 'codex';
      msg_count: number;
    }[];

    const getContent = source.prepare(`
      SELECT group_concat(p.text, ' ') AS content
      FROM message m
      JOIN (
        SELECT message_id, json_extract(data, '$.text') AS text
        FROM part
        WHERE json_extract(data, '$.type') = 'text'
      ) p ON p.message_id = m.id
      WHERE m.session_id = ?
      GROUP BY m.session_id
    `);

    const insertMany = this.indexDb.transaction(() => {
      for (const row of rows) {
        const contentRow = getContent.get(row.id) as { content: string | null } | undefined;
        const content = contentRow?.content || '';
        const projectPath = row.project_worktree || row.session_path || '';
        const project = projectPath ? basename(projectPath.replace(/\\/g, '/')) : '';
        insert.run(row.id, row.title || 'Untitled', content, row.msg_count, row.source, project);
      }
    });

    insertMany();
    source.close();

    return { total: rows.length, duration: Date.now() - start };
  }

  search(query: string, filters: SearchFilters = {}, limit = 50): SearchResult[] {
    if (!query.trim()) return [];

    try {
      const conditions = ['conv_fts MATCH ?'];
      const params: (string | number)[] = [query];

      if (filters.source) {
        conditions.push('source = ?');
        params.push(filters.source);
      }
      if (filters.project) {
        conditions.push('project = ?');
        params.push(filters.project);
      }
      params.push(limit);

      const rows = this.indexDb.prepare(`
        SELECT session_id, title,
               snippet(conv_fts, 2, '<mark>', '</mark>', '...', 64) AS snippet,
               rank, source
        FROM conv_fts
        WHERE ${conditions.join(' AND ')}
        ORDER BY rank
        LIMIT ?
      `).all(...params) as { session_id: string; title: string; snippet: string; rank: number; source: string }[];

      return rows.map(r => ({
        sessionId: r.session_id,
        title: r.title,
        snippet: r.snippet,
        score: r.rank,
        source: r.source
      }));
    } catch {
      return [];
    }
  }

  close(): void {
    this.indexDb.close();
  }
}

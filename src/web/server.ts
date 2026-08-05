import Database from 'better-sqlite3';
import express from 'express';
import { basename, join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createClient, WebDAVClient } from 'webdav';
import { OpenCodeStorage } from '../opencode';
import { SearchIndex, SearchResult } from './search';
import { Conversation } from '../types';

interface ConvSummary {
  id: string; title: string; project: string; updated: number; source?: string;
}

interface ProjectInfo {
  name: string; count: number; lastUpdated: number;
}

interface ConversationProvider {
  projects(src?: string): ProjectInfo[] | Promise<ProjectInfo[]>;
  list(projectFilter?: string, src?: string): ConvSummary[] | Promise<ConvSummary[]>;
  get(id: string, src?: string): Promise<Conversation | null>;
  search(query: string, src?: string, projectFilter?: string): SearchResult[] | Promise<SearchResult[]>;
  close(): void;
}

class SQLiteProvider implements ConversationProvider {
  private storage: OpenCodeStorage;
  private storagePath: string;
  private sessionPathColumn: 'directory' | 'path';

  constructor(storagePath: string) {
    this.storage = new OpenCodeStorage(storagePath);
    this.storagePath = storagePath;

    const db = new Database(join(storagePath, '..', 'opencode.db'), { readonly: true });
    const columns = db.prepare('PRAGMA table_info(session)').all() as { name: string }[];
    db.close();
    this.sessionPathColumn = columns.some(c => c.name === 'directory') ? 'directory' : 'path';
  }

  private projectName(dir: string): string {
    return dir ? basename(dir.replace(/\\/g, '/')) : '';
  }

  private sourceCondition(source?: string): string {
    if (source === 'codex') return "LOWER(COALESCE(s.agent, '')) = 'codex'";
    if (source === 'opencode') return "LOWER(COALESCE(s.agent, '')) <> 'codex'";
    return '1 = 1';
  }

  private loadAll(source?: string): {
    id: string;
    title: string;
    directory: string;
    time_updated: number;
    source: 'opencode' | 'codex';
  }[] {
    const db = new Database(join(this.storagePath, '..', 'opencode.db'), { readonly: true });
    try {
      const pathExpression = `COALESCE(NULLIF(p.worktree, ''), NULLIF(s.${this.sessionPathColumn}, ''), '')`;
      const rows = db.prepare(`
        SELECT s.id, s.title, ${pathExpression} AS directory, s.time_updated,
               CASE WHEN LOWER(COALESCE(s.agent, '')) = 'codex' THEN 'codex' ELSE 'opencode' END AS source
        FROM session s
        LEFT JOIN project p ON p.id = s.project_id
        WHERE ${this.sourceCondition(source)}
        ORDER BY s.time_updated DESC
      `).all() as any[];
      return rows;
    } finally {
      db.close();
    }
  }

  projects(source?: string): ProjectInfo[] {
    const sessions = this.loadAll(source);
    const map = new Map<string, { count: number; lastUpdated: number }>();
    for (const s of sessions) {
      const name = this.projectName(s.directory);
      if (!name) continue;
      const prev = map.get(name);
      if (prev) { prev.count++; if (s.time_updated > prev.lastUpdated) prev.lastUpdated = s.time_updated; }
      else { map.set(name, { count: 1, lastUpdated: s.time_updated }); }
    }
    return [...map.entries()].map(([n, i]) => ({ name: n, count: i.count, lastUpdated: i.lastUpdated })).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  list(projectFilter?: string, source?: string): ConvSummary[] {
    const sessions = this.loadAll(source);
    const filtered = projectFilter ? sessions.filter(s => this.projectName(s.directory) === projectFilter) : sessions;
    return filtered.map(r => ({
      id: r.id,
      title: r.title,
      project: this.projectName(r.directory),
      updated: r.time_updated,
      source: r.source
    }));
  }

  async get(id: string, source?: string): Promise<Conversation | null> {
    if (source === 'opencode' || source === 'codex') {
      const db = new Database(join(this.storagePath, '..', 'opencode.db'), { readonly: true });
      try {
        const row = db.prepare(`
          SELECT CASE WHEN LOWER(COALESCE(agent, '')) = 'codex' THEN 'codex' ELSE 'opencode' END AS source
          FROM session WHERE id = ?
        `).get(id) as { source?: string } | undefined;
        if (!row || row.source !== source) return null;
      } finally {
        db.close();
      }
    }
    return this.storage.getConversationData(id);
  }

  search(query: string, source?: string, projectFilter?: string): SearchResult[] {
    const dbPath = join(this.storagePath, '..', 'opencode.db');
    const search = new SearchIndex(':memory:');
    search.rebuild(dbPath);
    const sourceFilter = source === 'opencode' || source === 'codex' ? source : undefined;
    const results = search.search(query, { source: sourceFilter, project: projectFilter });
    search.close();
    return results;
  }

  close() { this.storage.close(); }
}

class JSONProvider implements ConversationProvider {
  private conversationsDir: string;

  constructor(syncDir: string) {
    this.conversationsDir = join(syncDir, 'conversations');
  }

  private scan(): { id: string; conv: Conversation }[] {
    if (!existsSync(this.conversationsDir)) return [];
    return readdirSync(this.conversationsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const raw = readFileSync(join(this.conversationsDir, f), 'utf-8');
          const conv = JSON.parse(raw) as Conversation;
          return { id: f.replace('.json', ''), conv };
        } catch { return null; }
      })
      .filter((x): x is { id: string; conv: Conversation } => x !== null);
  }

  projects(): ProjectInfo[] {
    const map = new Map<string, { count: number; lastUpdated: number }>();
    for (const { conv } of this.scan()) {
      const name = conv.metadata.project || '未知';
      const prev = map.get(name);
      if (prev) { prev.count++; if (conv.metadata.updated > prev.lastUpdated) prev.lastUpdated = conv.metadata.updated; }
      else { map.set(name, { count: 1, lastUpdated: conv.metadata.updated }); }
    }
    return [...map.entries()].map(([n, i]) => ({ name: n, count: i.count, lastUpdated: i.lastUpdated })).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  list(projectFilter?: string): ConvSummary[] {
    const all = this.scan().map(({ id, conv }) => ({
      id, title: conv.metadata.title, project: conv.metadata.project, updated: conv.metadata.updated
    }));
    return projectFilter ? all.filter(c => c.project === projectFilter) : all;
  }

  async get(id: string): Promise<Conversation | null> {
    try {
      const raw = readFileSync(join(this.conversationsDir, `${id}.json`), 'utf-8');
      return JSON.parse(raw) as Conversation;
    } catch { return null; }
  }

  search(query: string, _source?: string, projectFilter?: string): SearchResult[] {
    const q = query.toLowerCase();
    const results: SearchResult[] = [];
    for (const { id, conv } of this.scan()) {
      if (projectFilter && conv.metadata.project !== projectFilter) continue;
      const content = (conv.metadata.title + ' ' + conv.messages.map(m => m.summary.body || '').join(' ')).toLowerCase();
      const idx = content.indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + q.length + 40);
        let snippet = content.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet += '...';
        results.push({
          sessionId: id,
          title: conv.metadata.title,
          snippet: snippet.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`),
          score: -idx
        });
      }
    }
    return results.sort((a, b) => a.score - b.score).slice(0, 50);
  }

  close() {}
}

class WebDAVProvider implements ConversationProvider {
  private client: WebDAVClient;
  private conversationsPath: string;

  constructor(url: string, username?: string, password?: string) {
    this.conversationsPath = '/conversations';
    this.client = createClient(url, { username, password });
  }

  private async scan(): Promise<{ id: string; conv: Conversation }[]> {
    try {
      const items = await this.client.getDirectoryContents(this.conversationsPath) as any[];
      const results: { id: string; conv: Conversation }[] = [];
      for (const item of items) {
        if (item.type === 'file' && item.basename.endsWith('.json')) {
          try {
            const raw = await this.client.getFileContents(`${this.conversationsPath}/${item.basename}`, { format: 'text' }) as string;
            const conv = JSON.parse(raw) as Conversation;
            results.push({ id: item.basename.replace('.json', ''), conv });
          } catch { /* skip */ }
        }
      }
      return results;
    } catch { return []; }
  }

  async projects(): Promise<ProjectInfo[]> {
    const items = await this.scan();
    const map = new Map<string, { count: number; lastUpdated: number }>();
    for (const { conv } of items) {
      const name = conv.metadata.project || '未知';
      const prev = map.get(name);
      if (prev) { prev.count++; if (conv.metadata.updated > prev.lastUpdated) prev.lastUpdated = conv.metadata.updated; }
      else { map.set(name, { count: 1, lastUpdated: conv.metadata.updated }); }
    }
    return [...map.entries()].map(([n, i]) => ({ name: n, count: i.count, lastUpdated: i.lastUpdated })).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  async list(projectFilter?: string): Promise<ConvSummary[]> {
    const items = await this.scan();
    const all = items.map(({ id, conv }) => ({
      id, title: conv.metadata.title, project: conv.metadata.project, updated: conv.metadata.updated
    }));
    return projectFilter ? all.filter(c => c.project === projectFilter) : all;
  }

  async get(id: string): Promise<Conversation | null> {
    try {
      const raw = await this.client.getFileContents(`${this.conversationsPath}/${id}.json`, { format: 'text' }) as string;
      return JSON.parse(raw) as Conversation;
    } catch { return null; }
  }

  async search(query: string, _source?: string, projectFilter?: string): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    const items = await this.scan();
    const results: SearchResult[] = [];
    for (const { id, conv } of items) {
      if (projectFilter && conv.metadata.project !== projectFilter) continue;
      const content = (conv.metadata.title + ' ' + conv.messages.map(m => m.summary.body || '').join(' ')).toLowerCase();
      const idx = content.indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + q.length + 40);
        let snippet = content.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet += '...';
        results.push({
          sessionId: id, title: conv.metadata.title,
          snippet: snippet.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`),
          score: -idx
        });
      }
    }
    return results.sort((a, b) => a.score - b.score).slice(0, 50);
  }

  close() {}
}

class SourceProvider implements ConversationProvider {
  constructor(private database: SQLiteProvider, private sync?: ConversationProvider) {}

  sources() {
    const sources = [
      { id: 'all', label: '全部' },
      { id: 'opencode', label: 'OpenCode' },
      { id: 'codex', label: 'Codex' }
    ];
    if (this.sync) sources.push({ id: 'sync', label: '同步文件 (JSON)' });
    return sources;
  }

  private mergeProjects(groups: ProjectInfo[][]): ProjectInfo[] {
    const merged = new Map<string, { count: number; lastUpdated: number }>();
    for (const projects of groups) {
      for (const project of projects) {
        const previous = merged.get(project.name);
        if (previous) {
          previous.count += project.count;
          if (project.lastUpdated > previous.lastUpdated) previous.lastUpdated = project.lastUpdated;
        } else {
          merged.set(project.name, { count: project.count, lastUpdated: project.lastUpdated });
        }
      }
    }
    return [...merged.entries()]
      .map(([name, info]) => ({ name, count: info.count, lastUpdated: info.lastUpdated }))
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  async projects(src?: string): Promise<ProjectInfo[]> {
    if (src === 'opencode' || src === 'codex') return this.database.projects(src);
    if (src === 'sync') return this.sync ? Promise.resolve(this.sync.projects()) : [];

    const groups: ProjectInfo[][] = [this.database.projects()];
    if (this.sync) groups.push(await Promise.resolve(this.sync.projects()));
    return this.mergeProjects(groups);
  }

  async list(projectFilter?: string, src?: string): Promise<ConvSummary[]> {
    if (src === 'opencode' || src === 'codex') return this.database.list(projectFilter, src);
    if (src === 'sync') {
      return this.sync
        ? (await Promise.resolve(this.sync.list(projectFilter))).map(c => ({ ...c, source: 'sync' }))
        : [];
    }

    const databaseList = await Promise.resolve(this.database.list(projectFilter));
    const syncList = this.sync
      ? (await Promise.resolve(this.sync.list(projectFilter))).map(c => ({ ...c, source: 'sync' }))
      : [];
    return [...databaseList, ...syncList].sort((a, b) => b.updated - a.updated);
  }

  async get(id: string, src?: string): Promise<Conversation | null> {
    if (src === 'opencode' || src === 'codex') return this.database.get(id, src);
    if (src === 'sync') return this.sync ? this.sync.get(id) : null;

    const databaseConversation = await this.database.get(id);
    if (databaseConversation) return databaseConversation;
    return this.sync ? this.sync.get(id) : null;
  }

  async search(query: string, src?: string, projectFilter?: string): Promise<SearchResult[]> {
    if (src === 'opencode' || src === 'codex') return this.database.search(query, src, projectFilter);
    if (src === 'sync') {
      return this.sync
        ? (await Promise.resolve(this.sync.search(query, undefined, projectFilter))).map(r => ({ ...r, source: 'sync' }))
        : [];
    }

    const databaseResults = await Promise.resolve(this.database.search(query, undefined, projectFilter));
    const syncResults = this.sync
      ? (await Promise.resolve(this.sync.search(query, undefined, projectFilter))).map(r => ({ ...r, source: 'sync' }))
      : [];
    return [...databaseResults, ...syncResults].sort((a, b) => a.score - b.score).slice(0, 50);
  }

  close() {
    this.database.close();
    this.sync?.close();
  }
}

export function createApp(provider: ConversationProvider) {
  const isMulti = provider instanceof SourceProvider;
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public'), {
    maxAge: 0, etag: false, lastModified: false,
    setHeaders: (res) => res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  }));

  if (isMulti) {
    app.get('/api/sources', (_req, res) => {
      res.json({ sources: (provider as SourceProvider).sources(), default: (provider as SourceProvider).sources()[0]?.id || '' });
    });
  } else {
    app.get('/api/sources', (_req, res) => {
      res.json({ sources: [{ id: 'default', label: '默认' }], default: 'default' });
    });
  }

  function sourceStr(req: any): string | undefined {
    return isMulti ? (req.query.source as string || undefined) : undefined;
  }

  app.get('/api/projects', async (req, res) => {
    try {
      const src = sourceStr(req);
      const projs = isMulti ? await (provider as SourceProvider).projects(src) : await provider.projects();
      res.json({ projects: projs });
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/api/conversations', async (req, res) => {
    try {
      const filterProject = (req.query.project as string) || '';
      const src = sourceStr(req);
      const list = isMulti ? await (provider as SourceProvider).list(filterProject, src) : await provider.list(filterProject);
      res.json({ total: list.length, conversations: list });
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const src = sourceStr(req);
      const conv = isMulti ? await (provider as SourceProvider).get(req.params.id, src) : await provider.get(req.params.id);
      if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
      res.json(conv);
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/api/search', async (req, res) => {
    const q = req.query.q as string;
    const filterProject = (req.query.project as string) || '';
    if (!q || !q.trim()) { res.json({ results: [] }); return; }
    try {
      const src = sourceStr(req);
      const r: SearchResult[] = isMulti
        ? await (provider as SourceProvider).search(q, src, filterProject)
        : await provider.search(q, undefined, filterProject) as SearchResult[];
      res.json({ query: q, total: r.length, results: r });
    } catch { res.json({ results: [] }); }
  });

  app.use((_req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  return { app, close: () => provider.close() };
}

function createSyncProvider(pathOrUrl: string): ConversationProvider {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const envUser = process.env.WEBDAV_USER || '';
    const envPass = process.env.WEBDAV_PASS || '';
    console.log(`  Remote sync: ${pathOrUrl}`);
    return new WebDAVProvider(pathOrUrl, envUser || undefined, envPass || undefined);
  }
  return new JSONProvider(pathOrUrl);
}

function labelFor(source: ConversationProvider): string {
  if (source instanceof WebDAVProvider) return 'remote (WebDAV)';
  if (source instanceof JSONProvider) return 'sync files';
  return 'source';
}

export async function serve(storagePath: string, port: number, syncDir?: string) {
  const dbProvider = new SQLiteProvider(storagePath);
  const syncProvider = syncDir ? createSyncProvider(syncDir) : undefined;
  const provider = new SourceProvider(dbProvider, syncProvider);

  const { app, close } = createApp(provider);

  console.log(`OpenCode Web UI: http://localhost:${port}`);
  console.log(`  Source: database (opencode.db)`);
  if (syncDir) console.log(`  + sync files (${syncDir})`);

  app.listen(port, () => {});
  process.on('SIGINT', () => { close(); process.exit(0); });
}

export async function serveFromSyncDir(syncDir: string, port: number) {
  const provider = createSyncProvider(syncDir);
  const { app, close } = createApp(provider);

  app.listen(port, () => {
    console.log(`OpenCode Web UI (${labelFor(provider)}): http://localhost:${port}`);
  });

  process.on('SIGINT', () => { close(); process.exit(0); });
}

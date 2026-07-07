import Database from 'better-sqlite3';
import express from 'express';
import { basename, join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createClient, WebDAVClient } from 'webdav';
import { OpenCodeStorage } from '../opencode';
import { SearchIndex, SearchResult } from './search';
import { Conversation } from '../types';

interface ConvSummary {
  id: string; title: string; project: string; updated: number;
}

interface ProjectInfo {
  name: string; count: number; lastUpdated: number;
}

interface ConversationProvider {
  projects(src?: string): ProjectInfo[] | Promise<ProjectInfo[]>;
  list(projectFilter?: string, src?: string): ConvSummary[] | Promise<ConvSummary[]>;
  get(id: string, src?: string): Promise<Conversation | null>;
  search(query: string, src?: string): SearchResult[] | Promise<SearchResult[]>;
  close(): void;
}

class SQLiteProvider implements ConversationProvider {
  private storage: OpenCodeStorage;
  private storagePath: string;

  constructor(storagePath: string) {
    this.storage = new OpenCodeStorage(storagePath);
    this.storagePath = storagePath;
  }

  private projectName(dir: string): string {
    return dir ? basename(dir.replace(/\\/g, '/')) : '';
  }

  private loadAll(): { id: string; title: string; directory: string; time_updated: number }[] {
    const db = new Database(join(this.storagePath, '..', 'opencode.db'), { readonly: true });
    const rows = db.prepare("SELECT id, title, directory, time_updated FROM session ORDER BY time_updated DESC").all() as any[];
    db.close();
    return rows;
  }

  projects(): ProjectInfo[] {
    const sessions = this.loadAll();
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

  list(projectFilter?: string): ConvSummary[] {
    const sessions = this.loadAll();
    const filtered = projectFilter ? sessions.filter(s => this.projectName(s.directory) === projectFilter) : sessions;
    return filtered.map(r => ({ id: r.id, title: r.title, project: this.projectName(r.directory), updated: r.time_updated }));
  }

  async get(id: string): Promise<Conversation | null> {
    return this.storage.getConversationData(id);
  }

  search(query: string): SearchResult[] {
    const dbPath = join(this.storagePath, '..', 'opencode.db');
    const search = new SearchIndex(':memory:');
    search.rebuild(dbPath);
    const results = search.search(query);
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

  search(query: string): SearchResult[] {
    const q = query.toLowerCase();
    const results: SearchResult[] = [];
    for (const { id, conv } of this.scan()) {
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

  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    const items = await this.scan();
    const results: SearchResult[] = [];
    for (const { id, conv } of items) {
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

class MultiProvider implements ConversationProvider {
  providers: Map<string, ConversationProvider> = new Map();
  private defaultSource = '';

  constructor(db?: ConversationProvider, sync?: ConversationProvider) {
    if (db) { this.providers.set('database', db); this.defaultSource = 'database'; }
    if (sync) { this.providers.set('sync', sync); if (!this.defaultSource) this.defaultSource = 'sync'; }
  }

  sources() {
    return [...this.providers.keys()].map(key => ({
      id: key, label: key === 'database' ? '数据库 (opencode.db)' : '同步文件 (JSON)'
    }));
  }

  async getProvider(src?: string): Promise<ConversationProvider> {
    return this.providers.get(src || '') || this.providers.get(this.defaultSource)!;
  }

  async projects(src?: string): Promise<ProjectInfo[]> {
    return this.getProvider(src).then(p => p.projects()) as Promise<ProjectInfo[]>;
  }
  async list(projectFilter?: string, src?: string): Promise<ConvSummary[]> {
    return this.getProvider(src).then(p => p.list(projectFilter)) as Promise<ConvSummary[]>;
  }
  get(id: string, src?: string): Promise<Conversation | null> { return this.getProvider(src).then(p => p.get(id)); }
  async search(query: string, src?: string): Promise<SearchResult[]> { const p = await this.getProvider(src); const r = p.search(query); return r instanceof Promise ? r : Promise.resolve(r); }
  close() { for (const p of this.providers.values()) p.close(); }
}

export function createApp(provider: ConversationProvider) {
  const isMulti = provider instanceof MultiProvider;
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public'), {
    maxAge: 0, etag: false, lastModified: false,
    setHeaders: (res) => res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  }));

  if (isMulti) {
    app.get('/api/sources', (_req, res) => {
      res.json({ sources: (provider as MultiProvider).sources(), default: (provider as MultiProvider).sources()[0]?.id || '' });
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
      const projs = isMulti ? await (provider as MultiProvider).projects(src) : await provider.projects();
      res.json({ projects: projs });
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/api/conversations', async (req, res) => {
    try {
      const filterProject = (req.query.project as string) || '';
      const src = sourceStr(req);
      const list = isMulti ? await (provider as MultiProvider).list(filterProject, src) : await provider.list(filterProject);
      res.json({ total: list.length, conversations: list });
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const src = sourceStr(req);
      const conv = isMulti ? await (provider as MultiProvider).get(req.params.id, src) : await provider.get(req.params.id);
      if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return; }
      res.json(conv);
    } catch (error) { res.status(500).json({ error: String(error) }); }
  });

  app.get('/api/search', async (req, res) => {
    const q = req.query.q as string;
    if (!q || !q.trim()) { res.json({ results: [] }); return; }
    try {
      const src = sourceStr(req);
      const r: SearchResult[] = isMulti ? await (provider as MultiProvider).search(q, src) : await provider.search(q) as SearchResult[];
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
  const provider = syncProvider ? new MultiProvider(dbProvider, syncProvider) : dbProvider;
  const { app, close } = createApp(provider);

  console.log(`OpenCode Web UI: http://localhost:${port}`);
  console.log(`  Source: database (opencode.db)`);
  if (syncProvider) console.log(`  + ${labelFor(syncProvider)} (${syncDir})`);

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

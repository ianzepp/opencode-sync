import Database from 'better-sqlite3';
import express from 'express';
import { basename, join } from 'path';
import { OpenCodeStorage } from '../opencode';
import { SearchIndex } from './search';

export function createApp(storagePath: string) {
  const storage = new OpenCodeStorage(storagePath);
  const searchDbPath = join(storagePath, '..', 'search.db');
  const search = new SearchIndex(searchDbPath);

  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public'), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  }));

  function projectName(directory: string): string {
    return directory ? basename(directory.replace(/\\/g, '/')) : '';
  }

  function loadAllSessions(): { id: string; title: string; directory: string; time_updated: number }[] {
    const db = new Database(join(storagePath, '..', 'opencode.db'), { readonly: true });
    const rows = db.prepare(
      "SELECT id, title, directory, time_updated FROM session ORDER BY time_updated DESC"
    ).all() as any[];
    db.close();
    return rows;
  }

  app.get('/api/projects', (_req, res) => {
    try {
      const sessions = loadAllSessions();
      const projects = new Map<string, { count: number; lastUpdated: number }>();
      for (const s of sessions) {
        const name = projectName(s.directory);
        if (!name) continue;
        const prev = projects.get(name);
        if (prev) {
          prev.count++;
          if (s.time_updated > prev.lastUpdated) prev.lastUpdated = s.time_updated;
        } else {
          projects.set(name, { count: 1, lastUpdated: s.time_updated });
        }
      }
      const sorted = [...projects.entries()]
        .map(([name, info]) => ({ name, count: info.count, lastUpdated: info.lastUpdated }))
        .sort((a, b) => b.lastUpdated - a.lastUpdated);
      res.json({ projects: sorted });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/conversations', (_req, res) => {
    try {
      const filterProject = (_req.query.project as string) || '';
      const sessions = loadAllSessions();
      const filtered = filterProject
        ? sessions.filter(s => projectName(s.directory) === filterProject)
        : sessions;
      res.json({
        total: filtered.length,
        conversations: filtered.map(r => ({
          id: r.id,
          title: r.title,
          project: projectName(r.directory),
          updated: r.time_updated
        }))
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const conv = await storage.getConversationData(req.params.id);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      res.json(conv);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/search', (req, res) => {
    const q = req.query.q as string;
    if (!q || !q.trim()) {
      res.json({ results: [] });
      return;
    }

    const results = search.search(q);
    res.json({ query: q, total: results.length, results });
  });

  app.post('/api/search/rebuild', async (_req, res) => {
    try {
      const dbPath = join(storagePath, '..', 'opencode.db');
      const result = search.rebuild(dbPath);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Fallback to index.html for SPA-like navigation
  app.use((_req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  return {
    app,
    close: () => {
      storage.close();
      search.close();
    }
  };
}

export async function serve(storagePath: string, port: number) {
  const { app, close } = createApp(storagePath);

  const dbPath = join(storagePath, '..', 'opencode.db');
  const search = new SearchIndex(join(storagePath, '..', 'search.db'));

  console.log('Building search index...');
  const result = search.rebuild(dbPath);
  console.log(`Indexed ${result.total} conversations in ${result.duration}ms`);
  search.close();

  app.listen(port, () => {
    console.log(`OpenCode Web UI: http://localhost:${port}`);
  });

  process.on('SIGINT', () => {
    close();
    process.exit(0);
  });
}

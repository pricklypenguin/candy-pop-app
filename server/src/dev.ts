/**
 * Local sync server for development and end-to-end tests: the same handler with an in-memory store.
 * Run with `npm run dev:node` (PORT defaults to 8787). Data is lost when it stops.
 */
import { createServer } from 'node:http';
import { handle } from './handler';
import { MemoryStore } from './store';

const store = new MemoryStore(), port = Number(process.env.PORT || 8787);
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const r = await handle(new Request('http://localhost' + req.url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }), store, { ALLOWED_ORIGINS: '*' });
  const out: Record<string, string> = {}; r.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(r.status, out);
  res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined);
}).listen(port, () => console.log('steady sync dev server on http://localhost:' + port));

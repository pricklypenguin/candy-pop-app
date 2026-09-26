/** Cloudflare Worker entry point. */
import { cleanup, handle, type Env } from './handler';
import { D1Store } from './store';

interface WorkerEnv extends Env { DB: D1Database }

export default {
  fetch: (req: Request, env: WorkerEnv) => handle(req, new D1Store(env.DB), env),
  scheduled: async (_e: ScheduledController, env: WorkerEnv) => { await cleanup(new D1Store(env.DB)); }
};

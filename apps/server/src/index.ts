import Fastify from 'fastify';
import { SqliteMatchRecorder } from '@pokewar/persistence';
import { loadConfig } from './config.ts';
import { WebSocketRuntime } from './websocket-runtime.ts';

const config = loadConfig();
const server = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 16 * 1024,
  requestTimeout: 10_000,
});
const recorder = new SqliteMatchRecorder(config.databasePath);
const runtime = new WebSocketRuntime(server, config, recorder);

server.get('/health', async () => ({
  status: 'ok',
  service: 'pokewar-server',
  now: Date.now(),
}));

server.get('/api/leaderboard', async (request) => {
  const query = request.query as { limit?: string };
  return { entries: recorder.leaderboard(Number(query.limit ?? 50)) };
});

async function shutdown(signal: string): Promise<void> {
  server.log.info({ signal }, 'Shutting down');
  runtime.close();
  recorder.close();
  await server.close();
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await server.listen({ host: config.host, port: config.port });
  runtime.start();
  server.log.info({ host: config.host, port: config.port }, 'PokeWar server started');
} catch (error) {
  server.log.error({ error }, 'Server startup failed');
  recorder.close();
  process.exit(1);
}

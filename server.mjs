/**
 * server.mjs — 《扑克战争》boardgame.io 权威服务器 v3.0
 *
 * 架构：boardgame.io Server（状态机 + 房间管理 + SocketIO 传输）
 *       + 静态文件服务
 *
 * 启动: node server.mjs
 * PM2:  pm2 start server.mjs --name pokewar
 */
import { createRequire } from 'module';
import { PokeWar } from './game.js';

const require = createRequire(import.meta.url);
const { Server, Origins } = require('boardgame.io/dist/cjs/server.js');

const PORT = process.env.PORT || 8080;
const DEV_MODE = process.env.NODE_ENV !== 'production';

// ══════════════════════════════════════════════════
// CORS origins 白名单
// ══════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'http://game.n1komajor.top',
  'https://game.n1komajor.top',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  Origins.LOCALHOST_IN_DEVELOPMENT,
];

// ── 创建 boardgame.io 服务器 ──
const server = Server({
  games: [PokeWar],

  origins: ALLOWED_ORIGINS,
  apiOrigins: ALLOWED_ORIGINS,

  // ★ 修复: 不指定 apiPort → lobby API 与 game server 共享端口
  //   避免跨端口 CORS preflight 问题
  lobbyConfig: {
    // apiPort 不设置 = 自动挂载到 PORT
    apiCallback: () => {
      console.log(`[Lobby API] 运行在端口 ${PORT} (共享)`);
    },
  },
});

// ══════════════════════════════════════════════════
// ★ 修复: 显式 CORS + OPTIONS preflight 中间件
//   boardgame.io 内置 @koa/cors 但对 lobby API 端口
//   的 preflight 处理不完全。在最外层手动拦截 OPTIONS。
// ══════════════════════════════════════════════════
server.app.use(async (ctx, next) => {
  const origin = ctx.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => {
    if (typeof o === 'string') return origin === o;
    if (o instanceof RegExp) return o.test(origin);
    return !!o; // Origins.LOCALHOST_IN_DEVELOPMENT = allow all
  });

  if (allowed) {
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Access-Control-Allow-Credentials', 'true');
    ctx.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    ctx.set('Access-Control-Max-Age', '86400');
  }

  // ★ 拦截 OPTIONS preflight: 直接返回 204，不进入后续路由
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }

  await next();
});

// ══════════════════════════════════════════════════
// 静态文件服务（挂载在 Koa app 上）
// ══════════════════════════════════════════════════
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// 在 Koa app 上添加静态文件中间件
server.app.use(async (ctx, next) => {
  // 跳过 API 路由
  if (ctx.path.startsWith('/games/')) return next();

  let filePath = '.' + ctx.path;
  if (filePath === './') filePath = './index.html';

  const ext = extname(filePath).toLowerCase();
  if (existsSync(filePath) && MIME[ext]) {
    ctx.type = MIME[ext];
    ctx.body = readFileSync(filePath);
    return;
  }

  // SPA fallback: 非文件路径返回 index.html
  if (!ext || !MIME[ext]) {
    if (existsSync('./index.html')) {
      ctx.type = MIME['.html'];
      ctx.body = readFileSync('./index.html');
      return;
    }
  }

  await next();
});

// ── 启动 ──
server.run({
  port: PORT,
  callback: () => {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   🃏 扑克战争 (PokeWar) v3.0           ║');
    console.log('║   boardgame.io 权威服务器              ║');
    console.log(`║   Port: ${PORT}                              ║`);
    console.log(`║   Lobby API: /games/poke-war (共享端口)    ║`);
    console.log(`║   Mode: ${DEV_MODE ? 'DEVELOPMENT' : 'PRODUCTION'}                    ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log(`[Server] 服务器就绪 → http://localhost:${PORT}`);
    console.log(`[Lobby] 创建房间 → POST http://localhost:${PORT}/games/poke-war/create`);
    console.log('[CORS]  允许的来源:');
    ALLOWED_ORIGINS.forEach(o => {
      if (typeof o === 'string') console.log(`        ✓ ${o}`);
    });
    console.log('        ✓ localhost (Origins.LOCALHOST_IN_DEVELOPMENT)');
  },
});

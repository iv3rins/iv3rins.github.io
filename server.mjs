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
const API_PORT = process.env.API_PORT || 8081;
const DEV_MODE = process.env.NODE_ENV !== 'production';

// ══════════════════════════════════════════════════
// ★ 修复 1: 显式配置 CORS origins 数组
//   前端部署在 http://game.n1komajor.top → 必须加入白名单
//   本地调试也需要 localhost
//   注意: Origins 常量仅包含 LOCALHOST / LOCALHOST_IN_DEVELOPMENT，
//   生产域名需以字符串形式直接传入。
// ══════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  // ── 生产环境 ──
  'http://game.n1komajor.top',
  'https://game.n1komajor.top',
  // ── 开发环境 ──
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:9876',
  'http://127.0.0.1:8080',
  Origins.LOCALHOST_IN_DEVELOPMENT,
];

// ── 创建 boardgame.io 服务器 ──
const server = Server({
  games: [PokeWar],

  // ★ 修复: origins 显式列出所有前端源地址
  origins: ALLOWED_ORIGINS,

  // ★ 修复: apiOrigins 也需要独立配置，否则 Lobby API 的 CORS 也会拦截
  apiOrigins: ALLOWED_ORIGINS,

  // 开启 Lobby REST API
  // 客户端可通过 POST /games/poke-war/create 创建房间
  // POST /games/poke-war/join 加入房间
  // GET /games/poke-war 列出房间
  lobbyConfig: {
    apiPort: API_PORT,
    apiCallback: () => {
      console.log(`[Lobby API] 运行在端口 ${API_PORT}`);
    },
  },
});

// ── 静态文件服务（挂载在 Koa app 上） ──
// boardgame.io 内部使用 Koa，添加静态文件中间件
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
    console.log(`║   Game Port: ${PORT}                        ║`);
    console.log(`║   API Port:  ${API_PORT}                       ║`);
    console.log(`║   Mode: ${DEV_MODE ? 'DEVELOPMENT' : 'PRODUCTION'}                    ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log(`[Server] 服务器就绪 → http://localhost:${PORT}`);
    console.log(`[Lobby] 创建房间 → POST http://localhost:${API_PORT}/games/poke-war/create`);
    console.log('[CORS]  允许的来源:');
    ALLOWED_ORIGINS.forEach(o => {
      if (typeof o === 'string') console.log(`        ✓ ${o}`);
    });
    console.log('        ✓ localhost (Origins.LOCALHOST_IN_DEVELOPMENT)');
  },
});

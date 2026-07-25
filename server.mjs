/**
 * server.mjs — PokeWar V4 权威服务器
 *
 * 架构:
 *   boardgame.io Server (状态机 + 房间管理 + SocketIO)
 *   + sql.js (SQLite 内存数据库, 定时持久化到 disk)
 *   + REST API (排行榜/对战记录/快速匹配)
 *   + 静态文件托管
 *
 * 启动: node server.mjs
 * PM2:   pm2 start server.mjs --name pokewar
 */
import { createRequire } from 'module';
import { PokeWar } from './game.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { createHash, randomUUID } from 'crypto';

const require = createRequire(import.meta.url);
const { Server, Origins } = require('boardgame.io/dist/cjs/server.js');
const initSqlJs = require('sql.js');

const PORT = process.env.PORT || 8080;
const DEV_MODE = process.env.NODE_ENV !== 'production';
const DB_PATH = './pokeWar.db';
const DB_SAVE_INTERVAL = 30000; // 30 秒持久化一次

// ═══════════════════════════════════════
// 0. SQLite 数据库初始化
// ═══════════════════════════════════════

let db; // SQL.js Database 实例

async function initDB() {
  const SQL = await initSqlJs();

  // 尝试从磁盘加载已有数据库
  if (existsSync(DB_PATH)) {
    try {
      const buf = readFileSync(DB_PATH);
      db = new SQL.Database(buf);
      console.log('[DB] 已加载数据库, 大小:', buf.length, 'bytes');
    } catch (e) {
      console.warn('[DB] 数据库损坏, 重新创建:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('[DB] 新建内存数据库');
  }

  // ── 建表 ──
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      avatar        TEXT DEFAULT '🐱',
      password_hash TEXT DEFAULT NULL,
      is_guest      INTEGER DEFAULT 0,
      wins          INTEGER DEFAULT 0,
      losses        INTEGER DEFAULT 0,
      rating        INTEGER DEFAULT 1000,
      created       INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  // V6 迁移: 旧表补字段
  try { db.run('ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0'); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS match_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id  TEXT NOT NULL,
      player_id TEXT NOT NULL,
      result    TEXT NOT NULL,      -- 'win' | 'loss' | 'draw'
      rating_change INTEGER DEFAULT 0,
      played_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  console.log('[DB] 初始化完成');
}

/** 持久化到磁盘 */
function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    const buf = Buffer.from(data);
    writeFileSync(DB_PATH, buf);
  } catch (e) {
    console.error('[DB] 持久化失败:', e.message);
  }
}

// 定时保存
setInterval(saveDB, DB_SAVE_INTERVAL);

// 进程退出时保存
process.on('exit', saveDB);
process.on('SIGINT', () => { saveDB(); process.exit(); });
process.on('SIGTERM', () => { saveDB(); process.exit(); });

// ═══════════════════════════════════════
// 1. 快速匹配队列 (内存)
// ═══════════════════════════════════════

/** @type {{ playerId: string, playerName: string, avatar: string, resolve: Function, reject: Function }[]} */
const matchQueue = [];

function addToQueue(playerId, playerName, avatar) {
  return new Promise((resolve, reject) => {
    matchQueue.push({ playerId, playerName, avatar, resolve, reject });

    console.log(`[Match] 队列 +1 (总数 ${matchQueue.length}): ${playerName}`);

    // 满 2 人立即匹配
    if (matchQueue.length >= 2) {
      const p1 = matchQueue.shift();
      const p2 = matchQueue.shift();
      createMatchForPlayers(p1, p2).then(matchID => {
        p1.resolve({ matchID, opponent: p2.playerName });
        p2.resolve({ matchID, opponent: p1.playerName });
      }).catch(err => {
        p1.reject(err);
        p2.reject(err);
      });
    }
  });
}

async function createMatchForPlayers(p1, p2) {
  // 调用 boardgame.io 内部 API 创建房间
  // 通过 server 的 Koa router 创建匹配
  try {
    // boardgame.io 的 createMatch 需要 { game, numPlayers, setupData }
    const matchID = generateMatchID();
    // 实际上 boardgame.io 在 lobby 模式下会自动管理
    // 这里用 fetch 调自己的 lobby API
    const res = await fetch(`http://localhost:${PORT}/games/poke-war/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numPlayers: 2,
        setupData: {
          players: [
            { id: p1.playerId, name: p1.playerName, avatar: p1.avatar },
            { id: p2.playerId, name: p2.playerName, avatar: p2.avatar },
          ],
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Create match failed');
    console.log(`[Match] 匹配成功: ${p1.playerName} vs ${p2.playerName} → ${data.matchID}`);
    return data.matchID;
  } catch (e) {
    console.error('[Match] 创建房间失败:', e.message);
    throw e;
  }
}

function generateMatchID() {
  return Math.random().toString(36).substring(2, 10);
}

// ═══════════════════════════════════════
// 2. boardgame.io Server
// ═══════════════════════════════════════

const ALLOWED_ORIGINS = [
  'http://game.n1komajor.top',
  'https://game.n1komajor.top',
  Origins.LOCALHOST_IN_DEVELOPMENT,
];

const server = Server({
  games: [PokeWar],
  origins: ALLOWED_ORIGINS,
  apiOrigins: ALLOWED_ORIGINS,
  lobbyConfig: {
    apiCallback: () => console.log(`[Lobby API] 共享端口 ${PORT}`),
  },
});

// ═══════════════════════════════════════
// 3. 静态资源托管 (最优先 — 绝不透传给 Socket.IO)
// ═══════════════════════════════════════
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

server.app.use(async (ctx, next) => {
  // 放行 Socket.IO, Boardgame.io 游戏路由 与 自定义 API
  if (ctx.path.startsWith('/socket.io') || ctx.path.startsWith('/games') || ctx.path.startsWith('/api')) {
    return await next();
  }

  let fp = '.' + ctx.path;
  if (fp === './') fp = './index.html';
  const ext = extname(fp).toLowerCase();

  // 1. 存在对应静态文件则响应，并直接 return 阻止 next()
  if (existsSync(fp) && MIME[ext]) {
    ctx.type = MIME[ext];
    ctx.body = readFileSync(fp);
    return;
  }

  // 2. SPA 路由兜底，响应 index.html 并 return
  if (!ext || !MIME[ext]) {
    if (existsSync('./index.html')) {
      ctx.type = MIME['.html'];
      ctx.body = readFileSync('./index.html');
      return;
    }
  }

  await next();
});

// ═══════════════════════════════════════
// 4. CORS 兜底 + Body Parser (紧随静态文件之后)
// ═══════════════════════════════════════

server.app.use(async (ctx, next) => {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (ctx.method === 'OPTIONS') { ctx.status = 204; return; }
  await next();
});

server.app.use(async (ctx, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(ctx.method) && ctx.is('application/json')) {
    ctx.request.body = await new Promise((resolve) => {
      let data = '';
      ctx.req.on('data', chunk => data += chunk);
      ctx.req.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    });
  }
  await next();
});

/** POST /api/matchmake — 加入匹配队列 */
server.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/matchmake' || ctx.method !== 'POST') return next();
  try {
    const { playerId, playerName, avatar } = ctx.request.body || {};

    if (!playerId || !playerName) {
      ctx.status = 400;
      ctx.body = { error: '缺少 playerId 或 playerName' };
      return;
    }

    // 确保用户已注册
    ensureUser(playerId, playerName, avatar);

    const result = await addToQueue(playerId, playerName, avatar);
    ctx.body = { success: true, ...result };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

/** GET /api/leaderboard — 排行榜 Top 10 (排除游客) */
server.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/leaderboard' || ctx.method !== 'GET') return next();
  try {
    const result = db.exec('SELECT id, name, avatar, wins, losses, rating FROM users WHERE is_guest = 0 ORDER BY rating DESC LIMIT 10');
    const rows = result.length ? result[0].values.map(r => ({
      id: r[0], name: r[1], avatar: r[2], wins: r[3], losses: r[4], rating: r[5],
    })) : [];
    ctx.body = { leaderboard: rows };
  } catch (e) { ctx.status = 500; ctx.body = { error: e.message }; }
});

/** GET /api/stats/:id — 个人战绩 */
server.app.use(async (ctx, next) => {
  const m = ctx.path.match(/^\/api\/stats\/(.+)$/);
  if (!m || ctx.method !== 'GET') return next();
  try {
    const playerId = m[1];
    const user = db.exec('SELECT id, name, avatar, wins, losses, rating FROM users WHERE id = ?', [playerId]);
    const matches = db.exec(
      'SELECT match_id, result, rating_change, played_at FROM match_history WHERE player_id = ? ORDER BY played_at DESC LIMIT 20',
      [playerId]
    );

    ctx.body = {
      user: user.length ? {
        id: user[0].values[0][0], name: user[0].values[0][1],
        avatar: user[0].values[0][2], wins: user[0].values[0][3],
        losses: user[0].values[0][4], rating: user[0].values[0][5],
      } : null,
      history: matches.length ? matches[0].values.map(r => ({
        matchId: r[0], result: r[1], ratingChange: r[2], playedAt: r[3],
      })) : [],
    };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

// ═══════════════════════════════════════
// V6 Auth APIs
// ═══════════════════════════════════════

function hashPassword(pw) { return createHash('sha256').update(pw).digest('hex'); }

/** POST /api/register — 注册正式用户 */
server.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/register' || ctx.method !== 'POST') return next();
  try {
    const { username, password, avatar } = ctx.request.body || {};
    if (!username || !password) { ctx.status = 400; ctx.body = { error: '用户名和密码不能为空' }; return; }
    // 检查用户名是否已被注册
    const exist = db.exec('SELECT id FROM users WHERE name = ? AND is_guest = 0', [username]);
    if (exist.length) { ctx.status = 409; ctx.body = { error: '用户名已存在' }; return; }
    const id = 'u_' + randomUUID().substring(0, 12);
    db.run('INSERT INTO users (id, name, avatar, password_hash, is_guest) VALUES (?, ?, ?, ?, 0)',
      [id, username, avatar || '🐱', hashPassword(password)]);
    ctx.body = { success: true, playerId: id, playerName: username, avatar: avatar || '🐱' };
  } catch (e) { ctx.status = 500; ctx.body = { error: e.message }; }
});

/** POST /api/login — 登录 */
server.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/login' || ctx.method !== 'POST') return next();
  try {
    const { username, password } = ctx.request.body || {};
    if (!username || !password) { ctx.status = 400; ctx.body = { error: '用户名和密码不能为空' }; return; }
    const pwHash = hashPassword(password);
    const rows = db.exec('SELECT id, name, avatar, wins, losses, rating FROM users WHERE name = ? AND password_hash = ? AND is_guest = 0',
      [username, pwHash]);
    if (!rows.length) { ctx.status = 401; ctx.body = { error: '用户名或密码错误' }; return; }
    const r = rows[0].values[0];
    ctx.body = { success: true, playerId: r[0], playerName: r[1], avatar: r[2], wins: r[3], losses: r[4], rating: r[5] };
  } catch (e) { ctx.status = 500; ctx.body = { error: e.message }; }
});

/** POST /api/guest — 游客试玩 */
server.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/guest' || ctx.method !== 'POST') return next();
  try {
    const { playerName, avatar } = ctx.request.body || {};
    const id = 'g_' + randomUUID().substring(0, 10);
    const name = playerName || '游客' + Math.random().toString(36).substring(2, 6);
    db.run('INSERT INTO users (id, name, avatar, is_guest) VALUES (?, ?, ?, 1)', [id, name, avatar || '🐱']);
    ctx.body = { success: true, playerId: id, playerName: name, avatar: avatar || '🐱' };
  } catch (e) { ctx.status = 500; ctx.body = { error: e.message }; }
});

// ── 旧兼容: 匿名注册 ──
server.app.use(async (ctx, next) => {
  if (ctx.path === '/api/register' || ctx.path === '/api/login' || ctx.path === '/api/guest') return next();
  await next();
});

/** GET /api/online — 在线人数 */
server.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/online' || ctx.method !== 'GET') return next();
  try {
    // 简单计数: 匹配队列 + 估算活跃房间数
    const online = matchQueue.length + 1; // 基础值
    ctx.body = { online };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

// ── 工具 ──

function ensureUser(id, name, avatar = '🐱') {
  const existing = db.exec('SELECT id FROM users WHERE id = ?', [id]);
  if (!existing.length) {
    db.run('INSERT INTO users (id, name, avatar) VALUES (?, ?, ?)', [id, name, avatar]);
  } else {
    db.run('UPDATE users SET name = ?, avatar = ? WHERE id = ?', [name, avatar, id]);
  }
}

// ═══════════════════════════════════════
// 5. 启动
// ═══════════════════════════════════════

async function start() {
  await initDB();

  server.run({
    port: PORT,
    callback: () => {
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   🃏 PokeWar V4 — SQLite + Matchmaking ║');
      console.log(`║   Port: ${PORT}                              ║`);
      console.log('║   APIs: /api/leaderboard                 ║');
      console.log('║         /api/matchmake                   ║');
      console.log('║         /api/stats/:id                   ║');
      console.log('║         /api/register                    ║');
      console.log('║         /api/online                      ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log(`[Server] http://localhost:${PORT}`);
      console.log('[DB]     SQLite 已就绪');
    },
  });
}

start().catch(e => { console.error('Startup failed:', e); process.exit(1); });

# PokeWar V4 — 全栈重构指南 (Design System + Architecture Blueprint)

> **生成日期**: 2026-07-25  
> **项目路径**: `D:\iverins_workspace\game\KingdomWar`  
> **部署地址**: `game.n1komajor.top` (Debian 12 + 宝塔 + pm2, 端口 8080)  
> **当前状态**: 引擎测试 26/26 通过，前端按钮事件失效（模块导入链 + 初始化时序问题）

---

## 一、按钮失效根因分析

### 1.1 症状
所有按钮（创建房间、加入房间、万化、出牌等）点击无反应。

### 1.2 根因

| # | 问题 | 位置 |
|---|------|------|
| 1 | **`UIManager.initUI()` 中 `initGamePage()` 调用 `initGamePageEvents()`** — 该函数绑定 `#btn-confirm`、`#btn-wanhua` 等按钮事件。但这些按钮在 `#page-game` 中，页面加载时 `#page-game` 是隐藏的（`display:none`），**元素存在但事件在 DOMContentLoaded 时绑定，时序上 `initUI()` 在 `main.js` 的 `boot()` 中调用，此时 DOM 已就绪** — 所以这不是根本原因。 | `js/ui/UIManager.js:45` |
| 2 | **`initLobby()` 在 `boot()` 中先于 `initUI()` 调用**，`initLobby` 绑定大厅按钮（创建/加入房间等），`initUI` 绑定游戏页按钮。两者独立，各自绑定自己的按钮。 | `js/main.js:19-22` |
| 3 | **真正的问题：`app.js` 第 14 行** `const { Client, LobbyClient, SocketIO } = window.BoardgameIO \|\| {};` — 如果 CDN 脚本 `<script src="boardgame.io@0.50.2/dist/boardgameio.min.js">` 加载失败或时序晚于 ES module 执行，`window.BoardgameIO` 为 `undefined`，解构出三个 `undefined`。后续 `new LobbyClient(...)` 和 `Client(...)` 都会抛 `TypeError`，**整个模块初始化崩溃，所有依赖 `app.js` 的 UI 模块全部失效**。 | `js/app.js:14` |
| 4 | **`game.js` 新增 `import { resolveAttack } from './js/engine/combatUtils.js'`** — 如果浏览器加载 `combatUtils.js` 失败（路径/404），`game.js` 模块整体加载失败，`app.js` 的 `import { PokeWar } from '../game.js'` 也会失败，**级联崩溃**。 | `game.js:14` |

### 1.3 级联崩溃链

```
boardgame.io CDN 加载失败 / 时序问题
  → window.BoardgameIO = undefined
    → app.js: const { Client } = undefined → TypeError
      → app 模块初始化失败
        → lobbyUI.js import { app } 失败
        → gameUI.js import { app } 失败
        → UIManager.js import { app } 失败
          → 所有按钮事件绑定全部跳过（模块未加载）
```

---

## 二、完整架构蓝图

### 2.1 目标文件结构

```
KingdomWar/
├── index.html                    # 单页入口（仅加载 CDN + <script type="module">）
├── game.js                       # boardgame.io Game Definition（纯 Model）
├── server.mjs                    # Koa + boardgame.io Server + SQLite
├── package.json                  # type: "module"
│
├── css/
│   └── style.css                 # Neo-Brutalism 设计系统（CSS 变量驱动）
│
├── js/
│   ├── main.js                   # ★ 唯一入口：初始化顺序严格控制
│   ├── app.js                    # boardgame.io Client 控制器（延迟初始化）
│   ├── state.js                  # 全局单例 + 主题管理
│   ├── audioManager.js           # Web Audio API 音效合成器
│   │
│   ├── engine/                   # ★ 纯逻辑层（Node 可测试，零 DOM 依赖）
│   │   ├── combatUtils.js        # 战斗结算纯函数
│   │   └── ai.js                 # AI 控制器（enumerate + Bot）
│   │
│   └── ui/                       # 视图层
│       ├── lobbyUI.js            # 大厅渲染 + 房间管理
│       ├── gameUI.js             # 游戏内渲染 + 事件代理
│       ├── UIManager.js          # 页面切换 + 弹窗管理
│       └── toast.js              # 提示条
│
├── assets/
│   └── audio/                    # 备选音效文件（可选）
│
└── _verify.mjs                   # Node 端自动化测试（26 项）
```

### 2.2 初始化时序（★ 关键）

```javascript
// main.js — 严格控制初始化顺序
async function boot() {
  // 1. 等待 boardgame.io CDN 加载
  await waitForBoardgameIO();     // ★ 新增：轮询 window.BoardgameIO

  // 2. 音频解锁（首次用户交互）
  document.addEventListener('click', () => audioManager.unlock(), { once: true });

  // 3. 初始化大厅（绑定大厅按钮事件）
  initLobby();

  // 4. 初始化游戏 UI（绑定游戏页按钮事件）
  initUI();

  // 5. 恢复主题
  initTheme();
}

// ★ CDN 加载等待
function waitForBoardgameIO(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (window.BoardgameIO) return resolve();
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.BoardgameIO) { clearInterval(timer); resolve(); }
      else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error('boardgame.io CDN 加载超时'));
      }
    }, 100);
  });
}
```

### 2.3 app.js 改造：延迟初始化

```javascript
// app.js — 延迟获取 BoardgameIO，避免模块顶层崩溃
class AppController {
  constructor() {
    this._bgio = null; // 延迟初始化
  }

  /** 获取 BoardgameIO 实例（懒加载） */
  _getBGIO() {
    if (this._bgio) return this._bgio;
    if (!window.BoardgameIO) throw new Error('boardgame.io 未加载');
    this._bgio = {
      Client: window.BoardgameIO.Client,
      LobbyClient: window.BoardgameIO.LobbyClient,
      SocketIO: window.BoardgameIO.SocketIO,
    };
    return this._bgio;
  }

  initLobby(serverAddr) {
    const { LobbyClient } = this._getBGIO();
    this.lobby = new LobbyClient({ server: serverAddr || SERVER_ORIGIN });
  }

  connectGame() {
    const { Client, SocketIO } = this._getBGIO();
    this.client = Client({ /* ... */ });
  }
}
```

---

## 三、Design System — Neo-Brutalism 新粗野主义

### 3.1 配色系统

| 变量 | 日间模式 | 夜间模式 | 用途 |
|------|---------|---------|------|
| `--bg-color` | `#F4F4F0` | `#1A1A2E` | 全局背景 |
| `--text-main` | `#000000` | `#EAEAEA` | 主文字 |
| `--text-muted` | `#555555` | `#A0A0B0` | 辅助文字 |
| `--primary-acid` | `#CCFF00` | `#CCFF00` | **酸性绿强调**（按钮/高亮） |
| `--accent-blue` | `#0057FF` | `#448AFF` | 电光蓝（护盾/加入） |
| `--danger-red` | `#FF3B30` | `#FF5252` | 红色（关闭/报错） |
| `--glass-bg` | `#FFFFFF` | `#16213E` | 卡片/面板背景 |
| `--suit-red` | `#dc2626` | `#FF6B6B` | ♦♥ 花色 |
| `--suit-black` | `#000000` | `#E0E0E0` | ♣♠ 花色 |

### 3.2 边框与阴影

```css
/* 强制规范：纯黑 3px，无模糊 */
--border-thick: 3px solid #000000;
--border-thin:  2px solid #000000;
--shadow-hard:    6px 6px 0px #000000;
--shadow-hard-sm: 4px 4px 0px #000000;
```

### 3.3 字体排版

| 用途 | 字体 | 特效 |
|------|------|------|
| 大标题 (Hero) | `Impact / Arial Black` | `-webkit-text-stroke: 2.5px #000; text-shadow: 3px 3px 0 #000` |
| 卡片标题 | `Impact / Arial Black` | `-webkit-text-stroke: 1.5px #000` |
| 正文 | `Inter, system-ui` | **禁止描边**，`font-weight: 600` |
| 数字/伤害 | `Impact` | `-webkit-text-stroke: 2px #000` |

### 3.4 圆角规范

| 元素 | 圆角 |
|------|------|
| Bento 卡片 | `12px` |
| 按钮/弹窗 | `8px` |
| 输入框 | `6px` |
| 关闭按钮 | `50%`（正圆） |

### 3.5 暗色模式

**纯 CSS 变量驱动，零 `filter: invert()`**：

```css
html.dark-theme {
  --bg-color: #1A1A2E;
  --text-main: #EAEAEA;
  --glass-bg: #16213E;
  /* ... 全部变量覆盖 ... */
}
```

JS 切换：
```javascript
function setTheme(isDark) {
  document.documentElement.classList.toggle('dark-theme', isDark);
  localStorage.setItem('pokeWarDarkMode', isDark ? '1' : '0');
}
```

### 3.6 按钮系统

```css
.btn {
  padding: 12px 24px; border-radius: 8px;
  border: var(--border-thin);
  font-weight: 800; font-family: var(--font);
  box-shadow: var(--shadow-hard-sm);
  transition: all 0.2s ease;
  cursor: pointer;
}
.btn:active {
  transform: translate(2px, 2px);  /* 按下位移 */
  box-shadow: none;
}
.btn-primary { background: var(--primary-acid); color: #000; }
.btn-primary:hover { background: #DDFF33; }
.btn-danger { background: var(--danger-red); color: #FFF; }
```

### 3.7 确认/取消按钮（游戏内）

```css
/* 禁用态 — 死灰 */
#btn-confirm:disabled {
  background: #444; color: #888; cursor: not-allowed; opacity: 0.5;
}
/* 激活态 — 血红发光（:not(:disabled) 自动触发） */
#btn-confirm:not(:disabled) {
  background: linear-gradient(135deg, #ff3b30, #d32f2f);
  color: #fff; box-shadow: 0 4px 20px rgba(255,59,48,0.65);
  transform: scale(1.05);
}
```

### 3.8 Z-Index 层级

| 层级 | 值 | 元素 |
|------|----|------|
| 背景 | `0` | `body`, `.page-view` |
| 内容 | `1-50` | `.bento-card`, `.hand-area` |
| 导航栏 | `50` | `.lobby-topnav` |
| 选中卡牌 | `20-200` | `.poker-card.selected` |
| 弹窗 | `200` | `.modal-overlay` |
| 浮动按钮 | `10` | `.floating-actions` |
| 聊天 | `300` | `.chat-system-overlay` |
| Loading | `400` | `.loading-overlay` |
| Toast | `9999` | `.toast-container` |
| 横屏提示 | `9999` | `.orientation-prompt` |

---

## 四、音效系统 (Web Audio API)

### 4.1 架构

```
audioManager.js (单例)
  ├── unlock()          # 首次用户手势创建 AudioContext
  ├── play(name)        # 公开 API，解锁前排队
  └── _synthXxx()       # 私有合成器
```

### 4.2 音效配方（OscillatorNode 合成）

| 音效名 | 配方 | 时长 | 音量 | 用途 |
|--------|------|------|------|------|
| `click` | 800Hz sine | 0.06s | 0.12 | 通用按钮 |
| `select` | 600Hz sine | 0.08s | 0.10 | 选牌 |
| `attack` | 白噪声 + 200Hz sawtooth | 0.15+0.2s | 0.12 | 攻击 |
| `shield` | 1200+1600Hz 双音 sine | 0.06s×2 | 0.10 | 护盾 |
| `heal` | C-E-G 三音上行 (523/659/784Hz) | 0.12s×3 | 0.10 | 吸血 |
| `joker` | 300→600→900Hz square 滑音 | 0.1s×3 | 0.06 | Joker |
| `draw` | 1000Hz triangle | 0.05s | 0.08 | 摸牌 |
| `error` | 200Hz sawtooth + 150Hz square | 0.15+0.2s | 0.08 | 错误 |

### 4.3 使用方式

```javascript
import { audioManager } from '../audioManager.js';

// 所有按钮点击：
document.getElementById('btn-xxx').addEventListener('click', () => {
  audioManager.play('click');
  // ... 业务逻辑
});

// 攻击时（在 gameUI.js 的 showActionBroadcast 中）：
audioManager.play('attack');
```

---

## 五、boardgame.io 状态机架构

### 5.1 阶段流转

```
SELECTING_STARTER → PLAYING ⇄ WAITING_FOR_JOKER
                         ↓
                    [GAME_OVER]
```

### 5.2 Moves（动作）

| Move | 参数 | 阶段 | 说明 |
|------|------|------|------|
| `selectStarter` | `charIdx: 0/1/2` | SELECTING_STARTER | 选择首发角色 |
| `playCards` | `cardIndices[], targetId, declaredSuit` | PLAYING | 出牌（攻击/护盾/Joker） |
| `rescueWithJoker` | `jokerCardIdx` | WAITING_FOR_JOKER | 濒死救援 |

### 5.3 战斗结算（combatUtils.js）

```
playCards move
  → validatePlay(cards, declaredSuit)     # 校验合法性
  → resolveAttack({suit, value, hasA, targetChar, attackerChar})  # ★ 模块化结算
    → 返回 { finalDamage, lifesteal, triggerHarvest, isImmune, isDouble, shieldBlocked }
  → 应用伤害/护盾/吸血/摸牌
  → replenishHand (法则二：空城补给)
```

### 5.4 三大摸牌法则

| 法则 | 触发条件 | 数量 | 位置 |
|------|---------|------|------|
| ♦ 五谷丰登 | ♦ 攻击未被免疫 | 每点伤害 1 张，轮序 | `playCards` → `triggerDiamondDraw` |
| 空城补给 | 手牌为空/全 Joker | 3 张 | `_postPlayCleanup` / `rescueWithJoker` |
| 阵亡换将 | 角色死亡 | 死者 5 + 击杀者 3 | `handleCharacterDeath` |

---

## 六、UI 页面结构

### 6.1 三容器解耦

```html
<body>
  <!-- 持久化聊天（脱离页面生命周期） -->
  <div id="chat-system" class="chat-system-overlay">...</div>

  <!-- 页面切换作用域 -->
  <div id="scene-layer">
    <div class="page-view active" id="page-home">    <!-- 大厅 -->
    <div class="page-view" id="page-waiting">        <!-- 等待大厅 -->
    <div class="page-view" id="page-game">           <!-- 游戏对局 -->
    <div class="page-view" id="page-result">         <!-- 结算 -->
  </div>

  <!-- 弹窗（始终在 scene-layer 外，不受页面切换影响） -->
  <div class="modal-overlay" id="modal-auth">...</div>
  <div class="modal-overlay" id="wanhua-modal">...</div>
  <!-- ... -->
</body>
```

### 6.2 游戏对局 Bento Grid

```
┌──────────────────────────────────────────────┐
│  opponents-area  (flex wrap, 最高 12 人)      │
├──────────────┬───────────────────────────────┤
│ battle-left  │                               │
│ (self-char   │     battle-arena               │
│  bento)      │   ┌─────────────────────┐     │
│              │   │ phase-pill + timer   │     │
│              │   │ play-zone (战场)     │     │
│              │   │ battle-log-list      │     │
│              │   └─────────────────────┘     │
├──────────────┴───────────────────────────────┤
│  battle-bottom (hand-bento + floating-actions)│
│  [万化] [出牌] [取消]    手牌区              │
└──────────────────────────────────────────────┘
```

Grid 定义：
```css
.battle-shell {
  display: grid;
  grid-template-columns: 250px 1fr;
  grid-template-rows: 150px 1fr 200px;  /* ★ 底行固定 200px，不可 auto */
  grid-template-areas:
    "opponents opponents"
    "left      arena"
    "bottom    arena";
}
```

---

## 七、部署流程

### 7.1 本地开发

```bash
cd D:\iverins_workspace\game\KingdomWar
npm install
npm test                    # 运行 26 项引擎测试
node server.mjs             # 启动开发服务器 (localhost:8080)
```

### 7.2 生产部署 (Debian 12 + 宝塔 + pm2)

```bash
# SSH 到服务器
ssh root@64.90.30.38

# 拉取代码
cd /www/wwwroot/pokewar
git pull origin main
npm install --production

# 重启服务
pm2 restart pokewar
# 或首次部署：
pm2 start server.mjs --name pokewar

# 验证
curl http://localhost:8080/api/leaderboard
curl http://localhost:8080/ | grep "PokeWar"
```

### 7.3 GitHub Pages 前端部署

```bash
git add -A
git commit -m "fix: 重构 v4.0"
git push origin main
# 等待 1-3 分钟 GitHub Actions 构建
# 浏览器 Ctrl+F5 强刷
```

### 7.4 环境要求

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥18 | 运行时 |
| boardgame.io | 0.50.2 | 状态机框架 |
| sql.js | 1.14.1 | SQLite 内存数据库 |
| bcryptjs | 3.0.3 | 密码哈希 |
| jsonwebtoken | 9.0.3 | JWT 鉴权 |
| ws | 8.21.1 | WebSocket（备用） |
| pm2 | latest | 进程守护 |

---

## 八、关联 Skills

以下 Hermes Skills 是本项目的核心参考规范：

| Skill | 路径 | 核心内容 |
|-------|------|---------|
| **pokewar-advanced-game-mechanics** | `C:\Users\IVERINS\AppData\Local\hermes\skills\pokewar-advanced-game-mechanics\SKILL.md` | 阶段状态机、选将、濒死救援、万化浸染、花色免疫、三大摸牌法则、♣穿透、♥吸血无条件、VFX飘字、boardgame.io陷阱、Neo-Brutalism设计系统、暗黑模式CSS变量完整覆盖、DOM null-safety、事件代理、SPA剪贴板降级 |
| **card-game-frontend-architecture** | `skills\card-game-frontend-architecture\SKILL.md` | 扑克牌CSS渲染、Deck/Card OOP模式、Fisher-Yates洗牌、状态管理、Flexbox布局、音效系统、扇形手牌展开 |
| **boardgame-io** | `skills\software-development\boardgame-io\SKILL.md` | boardgame.io v0.50 Game Definition、Server/Client API、moves/phases/turn、Bot/AI |
| **surgical-refactor** | `skills\software-development\surgical-refactor\SKILL.md` | 多故障分类修复、surgical diff、死代码归档、验证模式、CSS filter暗色模式trade-off |
| **requesting-code-review** | `skills\software-development\requesting-code-review\SKILL.md` | Pre-commit验证管线、安全扫描、独立reviewer subagent、auto-fix循环 |

### Skills 关键规范速查

**pokewar-advanced-game-mechanics 核心规则**：

- §1: 阶段状态机 — 不用布尔标志，用显式 `phase` 字段
- §2: 开局选将 — `activeCharIndex = -1` 初始，全员选完切 PLAYING
- §3: 濒死救援 — `hp=0` 不直接死亡，`isDying=true`，10 秒 Joker 救援窗口
- §4: A 万化 — 浸染杂色牌，`aValue` 固定 +1，弹窗式花色选择
- §9: 花色规则 — ♠双倍 ♥吸血 ♦摸牌 ♣护盾/穿透，A 无视免疫
- §9b: ♥ 吸血无条件 — 不受免疫限制，回复 `hpDamage`
- §9c: 三大摸牌法则 — ♦五谷丰登、空城补给、阵亡换将
- §10.1: SPA 事件代理 — 避免 DOM 未渲染时绑定失败
- §10.2: 剪贴板降级 — `execCommand('copy')` fallback
- §10.8: 战绩数据流 — server→localStorage→UI 三层打通
- §19: 回合开始无自动摸牌 — `nextTurn()` 严禁 `drawCards`
- §25: z-index 堆叠 — 手牌 `selected` 需 `z-index: 200`
- §33: 黑夜模式纯 CSS 变量 — 零 `filter:invert()`

**card-game-frontend-architecture**:

- 扑克花色: ♦♥ 红色 `#dc2626`, ♣♠ 黑色 `#1e293b`
- Fisher-Yates 洗牌（不用 `sort(() => Math.random()-0.5)`）
- 手牌叠放: 负 `margin-left` + `:hover translateY(-8px)`
- DocumentFragment 批量 DOM 操作

---

## 九、重构优先级建议

| 优先级 | 任务 | 预估工作量 |
|--------|------|-----------|
| **P0** | 修复 `app.js` CDN 加载时序（延迟初始化 + waitForBoardgameIO） | 30 min |
| **P0** | 验证所有按钮事件绑定（创建房间/加入/万化/出牌/选将） | 1 hr |
| **P1** | `index.html` 弹窗移到 `#scene-layer` 外部 | 20 min |
| **P1** | 确保 `boardgame.io` CDN 可访问（检查 URL） | 10 min |
| **P2** | `gameUI.js` 和 `UIManager.js` 去重（`showPage` 等） | 30 min |
| **P2** | 删除 `UIManager.js` 中遗留的旧 `initGamePage` 死代码 | 15 min |
| **P3** | CSS 硬编码颜色全部替换为 `var()` | 1 hr |
| **P3** | 添加 `waitForBoardgameIO` 到 `main.js` | 15 min |

---

## 十、快速修复 Checklist

- [ ] `app.js:14` → 改为 `_getBGIO()` 延迟获取
- [ ] `main.js` → 添加 `waitForBoardgameIO()` + `async boot()`
- [ ] `index.html:8` → 确认 CDN URL 可访问
- [ ] `index.html:422` → 确认 `<script type="module">` 在 CDN `<script>` 之后
- [ ] `npm test` → 26/26 通过
- [ ] 浏览器 F12 Console → 无红色报错
- [ ] 点击"创建房间" → 有 `[App]` 日志输出
- [ ] 点击手牌 → 牌上浮 + 金边
- [ ] 点击"出牌" → `[App] playCards:` 日志 + 状态更新

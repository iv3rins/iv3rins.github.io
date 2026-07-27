# 扑克战争 (PokeWar) — 完整游戏规则文档

## 一、项目文件结构

```
pokewar/
├── server.mjs                    # WebSocket 权威服务器 (Node.js, ws库)
├── game.js                       # boardgame.io 状态机定义 (新)
├── package.json                  # type:module, deps: ws, express, jsonwebtoken, boardgame.io, matter-js
│
├── index.html                    # 主页面 (Bento Grid + Apple 毛玻璃)
├── css/
│   └── style.css                 # Catppuccin设计系统 + Apple Bento 变量
│
├── js/
│   ├── main.js                   # 主入口: 事件绑定, 房间创建/加入, 游戏启动
│   ├── state.js                  # 全局单例 G (G.ws, G.myPlayerId, G.currentState 等)
│   ├── networkHandler.js         # 客户端消息路由器: 接收服务器消息→派发UI
│   │
│   ├── engine/                   # ★ 游戏核心逻辑 (Node端可用, browser端也可用)
│   │   ├── GameEngine.js         # 状态机: phase, turn, playAttack, playShield, playJoker
│   │   ├── Player.js             # 玩家实体: hand[], characters[], activeCharIndex
│   │   ├── Character.js          # 角色实体: hp, shield, suit, lives, isDying, isDead
│   │   ├── Card.js               # 卡牌实体: suit, rank, value, isJoker
│   │   └── GameValidator.js      # 出牌校验: validatePlay, validateAceSuit
│   │
│   ├── network/                  # 网络层
│   │   ├── WSClient.js           # WebSocket 客户端 (替代旧P2PManager)
│   │   └── P2PManager.js         # (已废弃) PeerJS P2P 客户端
│   │
│   └── ui/                       # 视图层
│       ├── gameUI.js             # 游戏局内渲染 (renderState, renderHand, playActionBroadcast)
│       ├── lobbyUI.js            # 大厅渲染 (renderWaitingLobby)
│       ├── chatUI.js             # 聊天渲染 (addChat, sendGameChat)
│       ├── toast.js              # 提示条
│       ├── SkinManager.js        # 皮肤管理器 (CSS变量注入, 双主题)
│       └── UIManager.js          # 纯视图渲染器 (MVC View层)
│
├── vendor/                       # 外部框架 (gitignored)
│   ├── Puppertino/               # Apple macOS 风格 CSS 框架
│   ├── apple-bento-grid/         # Apple Bento 网格布局
│   └── darwin-skill/             # 自主 Skill 优化器
│
└── README.md
```

## 二、游戏规则

### 2.1 总览
- **玩家人数**: 2~4 人
- **牌堆**: 每4人=1副牌 (40张普通+2张Joker)
- **初始手牌**: 5张
- **手牌上限**: 7张
- **回合制**: 按玩家顺序轮流行动

### 2.2 角色系统
- 每个玩家拥有 **3个角色** (J/Q/K, 随机花色 ♠♥♣♦)
- 开局时选择一个作为 **首发角色** (activeChar)
- **角色属性**: hp=10, maxHp=10, shield=0, suit(花色), lives(命数)
- 角色花色用于 **免疫判定** 和 **穿刺判定**

### 2.3 出牌规则
- 单张: 任意非Joker牌可单出
- 多张: 必须 **同花色** (除非有A万化)
- A (万化牌): 可浸染杂色牌为同花色, A的点数固定+1
- Joker: 不受回合限制可插队, 单张复活死亡角色, 双张斩杀

### 2.4 花色规则

| 花色 | 攻击效果 | 免疫时 |
|------|---------|--------|
| ♠ 黑桃 | **双倍伤害** | 不翻倍 |
| ♥ 红桃 | **吸血** (回复实际削血量) | 不吸血 |
| ♦ 方块 | **五谷丰登** (全场轮序摸牌) | 不摸牌 |
| ♣ 梅花出牌 | 给自己加**护盾** | — |
| ♣ 角色属性 | 攻击时**穿透护盾** | — |
| A 万化 | 无视花色免疫 | — |

### 2.5 三大摸牌法则

**法则一 (♦ 方块)**: 发动五谷丰登时，从攻击者开始，存活玩家轮序各摸1张，直到摸满等于攻击点数的张数。

**法则二 (空城补给)**: 出牌结算后，如果手牌为空或只剩Joker，立刻补3张。

**法则三 (阵亡换将)**: 角色 HP ≤ 0 → 消耗一条命 → 换新角色上场 → 摸5张。击杀者摸3张奖励。没有命了 → 进入濒死状态。

### 2.6 阶段状态机

```
SELECTING_STARTER → PLAYING → WAITING_FOR_JOKER → PLAYING
                        ↑                              |
                        └──────────────────────────────┘
                              (Joker救援或10秒超时死亡)
```

### 2.7 万化合体 (A牌)
- 含A的组合出牌前必须通过弹窗选择 **浸染花色**
- 浸染后A的点数固定为 +1 (不可自定义)
- 含A时无视花色免疫 (A特权)
- 纯A单出只能用自身花色

### 2.8 断线重连
- 断线后有 **30秒** 重连窗口
- 15秒心跳保活 (PING/PONG)
- 3秒自动重连 (指数退避, 最多5次)
- 超时未重连 → 淘汰该玩家

## 三、通信协议 (Server ↔ Client)

### 3.1 服务器地址
```
ws://64.90.30.38:8080
```

### 3.2 消息类型

| 方向 | 类型 | 说明 |
|------|------|------|
| C→S | `create_room` | 创建房间 (payload: playerName, avatar) |
| C→S | `join_room` | 加入房间 (payload: roomCode, playerName, avatar) |
| C→S | `quick_match` | 快速匹配 |
| C→S | `toggle_ready` | 切换准备状态 |
| C→S | `start_game` | 房主开始游戏 (payload: maxLives) |
| C→S | `player_action` | 出牌/选将/救援 (payload: action, cardIndices, ...) |
| C→S | `chat` | 聊天 (payload: text) |
| C→S | `PING` | 心跳 |
| S→C | `room_created` | 房间创建成功 (payload: roomCode, myPlayerId) |
| S→C | `room_joined` | 加入房间成功 (payload: myPlayerId) |
| S→C | `ROOM_UPDATE` | 房间状态更新 (payload: players, state) |
| S→C | `GAME_START` | 游戏开始 (payload: enginePlayerId) |
| S→C | `SYNC_STATE` | 全量状态同步 (含脱敏手牌) |
| S→C | `BROADCAST` | 全屏出牌播报 (payload: attackerName, targetName, suit, rank) |
| S→C | `CHAT` | 聊天消息 |
| S→C | `GAME_OVER` | 游戏结束 (payload: winner, rounds) |
| S→C | `ERROR` | 错误提示 |
| S→C | `PONG` | 心跳回复 |

## 四、权限校验

- **房主** (`isHost=true`, 第一个加入房间的玩家):
  - 可以 **开始游戏**
  - 可以 **切换游戏模式** (快速/常规)
- **所有玩家**:
  - 可以 **切换准备**
  - 可以 **选将**, **出牌**, **聊天**
- **房主不需要准备** — 准备检查只针对其他玩家

## 五、部署与启动

```bash
# 服务器端
cd /www/wwwroot/pokewar
git pull origin main
npm install
pm2 start server.mjs --name pokewar

# 启动验证
node --input-type=module -e "import {GameEngine} from './js/engine/GameEngine.js'; const e = new GameEngine(2,3); console.log('Engine OK:', e.players.length, 'players');"
```

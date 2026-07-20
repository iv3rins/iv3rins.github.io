# 🤖 开发者 AI 装配指南：可爱大乱斗

**致对接 AI：** 你的任务是将之前生成的四个 HTML UI 视图、`gameCore.js`（底层逻辑）以及 `p2pManager.js`（网络通信）组合成一个可运行的单页面应用（SPA）。请严格按照以下架构和数据流进行装配。

## 1. 架构原则：Host-Client 同步模型
由于这是一个回合制棋牌游戏，为了防止作弊和状态冲突，**绝对不能**让每个端各自计算逻辑。
*   **房主 (Host)：** 负责实例化 `GameEngine`。接收所有客户端的 `ACTION` 请求，通过引擎计算后，将全局 `STATE` 广播给所有客户端。
*   **客户端 (Client)：** **不要**实例化 `GameEngine`。只负责监听 UI 点击事件，将动作发送给房主，并根据收到的 `STATE` 渲染界面。

## 2. 依赖引入顺序
在最终的 `index.html` 中，按照以下顺序引入脚本：
1.  `<script src="https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js"></script>`
2.  `<script src="./gameCore.js"></script>`
3.  `<script src="./p2pManager.js"></script>`
4.  `<script src="./app.js"></script>` (你将要编写的主业务逻辑)

## 3. P2P 消息通信协议 (JSON Contract)
你必须实现一套 Action 派发机制，包含以下核心事件类型：

| type (事件类型) | payload (数据载荷) | 发送方 -> 接收方 | 说明 |
| :--- | :--- | :--- | :--- |
| `JOIN_REQ` | `{ playerName: "小猫猫" }` | Client -> Host | 客户端请求加入房间，并附带昵称 |
| `SYNC_STATE` | `{ players: [...], currentPlayerIndex: 0, deckCount: 42 }` | Host -> Client | 房主向所有人广播当前最新的游戏完整快照 |
| `PLAY_CARD` | `{ targetPlayerId: "xx", cards: [...], aValue: 8 }` | Client -> Host | 客户端告诉房主他要出什么牌、打谁 |
| `CHAT` | `{ senderName: "小猫猫", text: "哈喽" }` | 任意 -> 任意 | 聊天消息（需经过 Host 中转广播） |
| `GAME_OVER` | `{ winner: "小猫猫", maxDamage: 120 }` | Host -> Client | 触发结算页面切换 |

## 4. UI 绑定要求 (DOM Mapping)
在 `app.js` 中，你需要拦截之前 HTML 中的假数据函数，替换为网络调用：

*   **`createRoom()` 劫持：** 
    实例化 `p2p = new P2PManager()`，调用 `p2p.createRoom()`。回调成功后，实例化 `gameEngine = new GameEngine(人数)`，跳转至 `page-game`。
*   **`joinRoom()` 劫持：**
    实例化 `p2p = new P2PManager()`，调用 `p2p.joinRoom(输入框的邀请码)`。回调成功后，发送 `JOIN_REQ` 给房主。
*   **`executeAttack()` 劫持：**
    收集被选中的卡牌 DOM 映射的原始数据，封装成 `PLAY_CARD` 结构，通过 `p2p.sendMessage()` 发送给房主。**切勿直接在本地计算伤害。**
*   **状态渲染 (`renderState(state)`)：**
    编写一个统一的渲染函数。每次收到 `SYNC_STATE` 时，清空 `#opponents-container` 和 `.self-area`，根据 `state.players` 数组的数据动态生成 HTML，更新血条宽度 (`hp / maxHp * 100%`)，更新护盾宽度，更新手牌 DOM。

## 5. 观战与淘汰逻辑
*   在 `renderState` 中遍历玩家列表时，检查该玩家的 `isEliminated` 状态。
*   如果属于当前客户端对应的玩家 `isEliminated === true`，通过 JS 动态给 `#page-game` 添加类名 `spectator-mode`，触发 UI 层的 CSS 隐藏操作。

**执行指令：** 
阅读完毕后，请立即开始编写 `app.js`，实现上述绑定，完成最终组装！
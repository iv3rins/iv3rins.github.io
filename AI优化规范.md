这是一份为 Agent / DeepSeek V4 Pro 量身定制的**重构与 Bug 修复 Prompt 指令文档**。你只需要直接复制下方 Markdown 框内的完整内容，发送给 DeepSeek V4 Pro（或对应的 Agent），它就会自动按照指定的步骤完成代码拆分与 Bug 修复。

---

# 🤖 Agent 重构指令：可爱大乱斗前端逻辑拆分与 Bug 修复

> **任务目标**：对《可爱大乱斗》项目进行全面代码重构。修复 P2P 聊天重复发送/渲染错误、优化聊天框样式 UI、纯净化 P2P 网络层，并将庞大的 `app.js` 与 `core.js` 拆分为职责清晰的 ES6 模块（支持浏览器原生 `<script type="module">`）。

---

## 🛠️ 第一部分：核心 Bug 修复清单

### 1. 聊天系统双重广播与渲染 Bug 修复

* **问题分析**：
1. `p2pManager.js` 的 `_handleData` 中硬编码了 `if (this.isHost && data.type === 'CHAT') this.sendMessage(data)`，导致网络层强行广播一次。
2. 随后 `app.js` 的 `handleHostMessage` 在收到 `CHAT` 时又调用了一次 `G.p2p.sendMessage(data)`，导致所有客户端收到**双重重复消息**。
3. `addWaitingChat`/`addGameChat` 兼容旧调用时传入了 `'unknown'`，导致 `isSelf` 判空失效，消息渲染身份混淆。


* **修复要求**：
* **完全移除 `p2pManager.js` 中的业务判断**，网络层只负责收发数据。
* 聊天转发逻辑**统一交由 `handleHostMessage` 处置**：房主收到客户端聊天消息后，调用本地渲染，并广播转发给其他客户端；客户端收到广播消息后渲染。
* 统一聊天 Payload 结构：`{ senderId, senderName, text, isSystem }`。



### 2. 聊天气泡 UI 优化 (`index.html`)

* **修改 `.chat-messages` 与 `.chat-bubble` CSS**：
* 使用 Flex 布局。发送者 (`isSelf: true`) 靠右对齐、背景浅红/橙色，接收者 (`isSelf: false`) 靠左对齐、背景白色加边框。
* 增加 `max-width: 80%` 与 `word-break: break-word`，防止文字超出聊天框。
* 添加自动平滑滚动：每次追加新消息后执行 `box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })`。



---

## 🏗️ 第二部分：模块化重构架构设计

请按以下目录结构将原有代码拆分为标准的 ES6 模块：

```text
/
├── index.html                  # 入口 HTML
├── css/
│   └── style.css               # 从 index.html 中抽离出的完整样式
└── js/
    ├── engine/                 # 原 core.js 拆分
    │   ├── Card.js             # 卡牌实体类
    │   ├── Character.js        # 角色实体类
    │   ├── Player.js           # 玩家实体类
    │   ├── GameValidator.js    # 出牌规则与合法性校验
    │   └── GameEngine.js       # 主游戏逻辑引擎
    ├── network/                # 原 p2pManager.js 优化
    │   └── P2PManager.js       # 纯净的 WebRTC P2P 网络管理器
    ├── ui/                     # UI 视图渲染与交互
    │   ├── chatUI.js           # 聊天框渲染与逻辑
    │   ├── lobbyUI.js          # 大厅与玩家列表渲染
    │   └── gameUI.js           # 游戏局内卡牌/角色/回合 UI 渲染
    ├── state.js                # 全局状态管理 (G 对象)
    ├── networkHandler.js       # 房主与客户端消息路由处理
    └── main.js                 # 业务总入口与 DOM 事件绑定

```

---

## 📝 第三部分：各模块具体拆分实现指引

### 1. `js/network/P2PManager.js`（纯净 P2P 网络层）

* 继承原 PeerJS 操作，移除所有 `data.type === 'CHAT'` 等业务代码。
* 提供通用接口：`createRoom(roomId)`、`joinRoom(roomId)`、`sendMessage(data)`（广播）、`sendTo(peerId, data)`（单播）、`disconnect()`。
* 内部接收消息时直接解包并回调 `this.callbacks.onMessage(data, senderId)`。

### 2. `js/engine/` 目录（原 `core.js` 拆分）

* **`Card.js`**：导出 `Card` 类，包含 `calculateValue()` 方法。
* **`Character.js`**：导出 `Character` 类，包含 `takeDamage(amount, ignoreShield)`、`revive()`、`execute()`。
* **`Player.js`**：导出 `Player` 类，包含 `getActiveCharacter()`、`checkElimination()`、`removeCardsFromHand()`、`needsReplenish()`。
* **`GameValidator.js`**：抽离 `validatePlay(cards)` 独立验证函数，返回 `{ valid, error, primarySuit, normalCards, hasA }`。
* **`GameEngine.js`**：导入上述实体，实现初始化、发牌、`playShield`、`playAttack`、`playJoker` 及回合流转 (`nextTurn`, `checkWinCondition`)。

### 3. `js/state.js`（全局状态）

* 导出单例状态对象 `G`：
```javascript
export const G = {
    p2p: null,
    isHost: false,
    playerName: '',
    roomCode: '',
    myPlayerId: -1,
    gameEngine: null,
    peerToPlayer: {},
    playerToPeer: {},
    engineToLobby: {},
    playerNames: {},
    playerReady: {},
    currentState: null,
    selectedTargetId: -1,
    selectedCardIndices: [],
    timerTimeout: null,
    roundCount: 0,
    maxPlayers: 12,
    avatars: ['🐱','🐶','🐰','🐻','🦊','🐼','🐧','🦁','🐸','🐨','🐯','🐷'],
    gameStarted: false,
    _pendingClear: false
};

```



### 4. `js/ui/chatUI.js`（聊天控制器）

* 提供 `renderChatBubble(boxId, isSelf, senderName, text, isSystem)` 函数。
* 统一处理大厅聊天 (`sendWaitingChat`) 与战斗聊天 (`sendGameChat`)。
* 正确区分系统消息 (`isSystem: true`) 与普通玩家聊天气泡。

### 5. `js/ui/lobbyUI.js` & `js/ui/gameUI.js`（界面渲染）

* **`lobbyUI.js`**：包含 `renderWaitingLobby()`、`showPage(pageId)`、`showModal(text)`。
* **`gameUI.js`**：包含 `renderState(state)`、`renderOpponents(state)`、`renderSelf(state)`、`createPlayerCard(...)`、`renderHand(cards)`、`updateTurnUI(state)`、`updateAValuePanel()`。

### 6. `js/networkHandler.js`（消息处理）

* **`handleHostMessage(data, senderId)`**：
* 处理 `JOIN_REQ`、`TOGGLE_READY`、`PLAY_CARD`。
* 处理 `CHAT`：如果 `data.payload.senderId !== G.p2p.myId`，先在本地渲染 `addChat`，随后调用 `G.p2p.sendMessage(data)` 单次转发给其他客户端。


* **`handleClientMessage(data, senderId)`**：
* 处理 `LOBBY_STATE`、`GAME_START`、`SYNC_STATE`、`GAME_OVER`、`ERROR`。
* 处理 `CHAT`：直接调用本地渲染 `addChat`。



### 7. `js/main.js`（应用入口）

* 导入所有模块，初始化 UI 事件监听（按钮点击、Enter 键发送聊天等）。
* 导出 `initHomePage`、`initWaitingPage`、`initGamePage`、`createRoom`、`joinRoom`、`executeAttack` 等交互回调。

---

## 📄 第四部分：HTML 文件更新规范 (`index.html`)

更新 HTML 末尾的 `<script>` 引入，采用 ES6 模块加载：

```html
    <!-- 第三方 PeerJS 库 -->
    <script src="https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js"></script>
    
    <!-- 主 ES6 模块入口 -->
    <script type="module" src="./js/main.js"></script>
</body>
</html>

```

---

## ✅ 输出交付要求

请按顺序生成并输出重构后的完整文件内容（不要使用省略号）：

1. `index.html`（更新后的 HTML 及优化后的 CSS）
2. `js/network/P2PManager.js`
3. `js/engine/Card.js`
4. `js/engine/Character.js`
5. `js/engine/Player.js`
6. `js/engine/GameValidator.js`
7. `js/engine/GameEngine.js`
8. `js/state.js`
9. `js/ui/chatUI.js`
10. `js/ui/lobbyUI.js`
11. `js/ui/gameUI.js`
12. `js/networkHandler.js`
13. `js/main.js`
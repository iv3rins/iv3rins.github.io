# 🐾 可爱大乱斗 — P2P 卡牌对战

基于 WebRTC (PeerJS) 的无后端多人回合制卡牌游戏。

## 快速部署到 GitHub Pages

### 方式一：Web 上传
1. 在 GitHub 创建一个新仓库（如 `cute-brawl`）
2. 将本目录下这 5 个文件上传到仓库根目录：
   - `index.html`
   - `core.js`
   - `p2pManager.js`
   - `app.js`
   - `README.md`（可选）
3. 进入仓库 **Settings → Pages**，Source 选 `main` 分支，根目录 `/`，点 Save
4. 等待 1-2 分钟，访问 `https://你的用户名.github.io/仓库名/`

### 方式二：命令行
```bash
git init
git add index.html core.js p2pManager.js app.js README.md
git commit -m "init: 可爱大乱斗"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
# 然后去 Settings → Pages 开启
```

## 玩法

| 角色 | 操作 |
|---|---|
| **房主** | 点「创建房间」→ 把 4 位邀请码发给朋友 |
| **客户端** | 输入邀请码 → 点「加入」 |

- 选中手牌 → 选中对手 → 点「攻击」
- 同花色出 1/3/5 张牌（不计 A）
- ♠ 双倍伤害 · ♥ 吸血 · ♦ 群体摸牌 · ♣ 加护盾
- Joker 单张复活 / 两张斩杀
- 30 秒倒计时，超时自动随机出牌

## 技术栈

- **网络**: PeerJS (WebRTC) — 公开信令服务器，无需后端
- **逻辑**: Host-Client 权威模型，房主计算 + 广播
- **UI**: 纯 HTML/CSS/JS 单页面，零依赖框架

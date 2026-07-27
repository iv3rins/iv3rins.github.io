# PokeWar Framework

面向 PokeWar 的高解耦 TypeScript 单体仓库骨架，目标是先获得**可验证的正确性**，再扩展功能。默认运行方式是“权威 WebSocket 服务器 + 纯函数规则域 + Vite 轻量前端”；`boardgame.io` 被隔离为可选适配器，避免旧项目中 CDN、模块导入链和初始化时序造成全站按钮失效。

## 快速开始

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm verify
pnpm dev
```

- Web：`http://localhost:5173`
- API：`http://localhost:8080/health`
- WebSocket：`ws://localhost:8080/ws`

## 核心边界

```text
apps/web ───────┐
                ├──> packages/protocol
apps/server ────┤
      │         └──> packages/application ──> packages/domain
      └────────────> packages/persistence

packages/domain：纯规则，无 IO、无框架、无随机全局状态
packages/application：房间、权限、用例编排
packages/protocol：网络消息 Schema 与类型
packages/persistence：比赛记录持久化适配器
apps/server：HTTP/WS、限流、重连、广播、定时器
apps/web：事件代理、状态投影、Neo-Brutalism UI
```

## 规则裁决

- 玩家人数严格为 2–12 人。
- 每多4人就多40 张 A–10 普通牌 + 2 张 Joker。
- 红桃命中同花色免疫时不造成伤害，也不吸血。
- 回合开始不自动摸牌。
- 暗色模式使用 CSS 变量，不使用整页反色滤镜。

详细冲突记录见 `docs/SOURCE_DECISIONS.md`。

## 生产部署

见 `docs/DEPLOY_DEBIAN12.md`。默认按单机、单进程、内存房间状态设计；比赛结果写入 SQLite，热路径不访问数据库。

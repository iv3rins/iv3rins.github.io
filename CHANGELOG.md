# Changelog

## Unreleased

- 玩家人数上限从 4 人放宽至 12 人。
- 牌组动态缩放：基础 4 人牌组（40 普通 + 2 Joker），每多 4 人增加 40 普通 + 2 Joker。
- `createDeck()` 新增 `numPlayers` 参数（默认 4，向后兼容）。
- `RoomService.MAX_PLAYERS` 从 4 提升至 12。
- 新增 10 项 scaling 测试覆盖 2/5/12 人牌组大小、玩家数边界校验和 12 人完整选将流程。

## 0.1.0 - 2026-07-26

- 建立高解耦 PokeWar TypeScript 工作区。
- 实现规则域、房间用例、WebSocket 协议、SQLite 战绩和轻量前端骨架。
- 加入 Hermes + DeepSeek Agent 权限、Prompt 模板、架构守卫和 Debian 12 部署配置。

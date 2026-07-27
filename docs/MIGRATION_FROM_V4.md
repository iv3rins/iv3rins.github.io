# 从旧 V4 项目迁移

## 原则

不要直接把旧文件整体复制进新骨架。按边界迁移，每一步保持可运行。

## 顺序

1. 将旧 `_verify.mjs` 用例转写到 `packages/domain/test/`，先建立规则基线。
2. 把 `combatUtils.js`、Validator 和 GameEngine 行为迁入 `packages/domain`，不带 DOM/网络代码。
3. 用新协议接管创建房间、加入、准备和开始游戏。
4. 旧前端先只消费 `ROOM_UPDATE` / `SYNC_STATE`，不再直接操作引擎。
5. 把按钮改为根节点事件代理，删除重复 `initGamePageEvents()`。
6. 删除 CDN boardgame.io；确有需要时启用可选 adapter。
7. 将 CSS 硬编码迁入 Token，最后移除旧全局样式。
8. 每一步执行 `pnpm verify` 和浏览器手动清单。

## 禁止一次性迁移

- 不在同一提交同时更换网络、规则、UI 和数据库。
- 不保留两个可写权威状态。
- 不用兼容层长期双写；每个兼容层必须有删除日期和测试。

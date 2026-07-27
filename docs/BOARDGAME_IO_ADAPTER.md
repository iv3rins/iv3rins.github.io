# boardgame.io 可选适配器

`packages/adapter-boardgameio` 只把 boardgame.io Move 转换为领域函数调用。它不是第二套规则引擎。

约束：

- 只能通过 npm 构建期依赖加载，禁止浏览器 CDN 和 `window.BoardgameIO`。
- 不允许在 adapter 中复制伤害、免疫、摸牌或死亡公式。
- 默认生产服务器不启用该 adapter；启用前必须完成 boardgame.io 0.50.2 集成测试。
- boardgame.io 的 `playerView` 必须调用 `toPublicGameState`，不能把完整 `G` 下发。

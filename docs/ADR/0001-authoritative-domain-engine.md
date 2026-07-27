# ADR 0001：权威纯领域引擎

- Status: Accepted
- Date: 2026-07-26

## Context

旧项目同时存在自定义 WebSocket 引擎和 boardgame.io 状态机，且浏览器 CDN 全局加载失败会使模块初始化级联崩溃。

## Decision

玩法逻辑只存在于 `packages/domain`。默认服务器使用 `ws` 作为权威运行时。boardgame.io 只能通过可选适配器调用同一领域函数，不得复制规则。

## Consequences

- 规则可以无 DOM、无网络测试。
- 服务器和未来 Bot 共用同一逻辑。
- 需要显式维护协议与公开视图，但故障边界更清晰。

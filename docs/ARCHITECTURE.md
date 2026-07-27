# 架构说明

## 1. 设计目标

- **规则可测试**：同一个动作在服务器、测试和可选 boardgame.io 适配器中得到相同结果。
- **权威服务器**：客户端只提交意图，不能提交最终伤害、摸牌结果或回合结果。
- **故障隔离**：UI 初始化失败不能污染规则域；数据库失败不能阻塞一局内的热路径。
- **可替换适配器**：WebSocket、持久化、UI 框架可以替换，领域模型不变。
- **低资源开销**：适配 Debian 12 入门 KVM，默认单 Node 进程，不启用无意义集群。

## 2. 依赖方向

```text
外层（可变）                           内层（稳定）
Web / Server / boardgame.io adapter -> Application -> Domain
                  Protocol -----------^
                  Persistence <-------- Server
```

依赖只能向内。Domain 不知道房间、WebSocket、DOM、SQLite 或 Agent。

## 3. 数据流

1. 客户端发送 `C2SMessage`。
2. 服务器用 Zod 校验结构、大小、频率和会话权限。
3. `RoomService` 将命令转换为领域命令。
4. 领域函数返回新状态和领域事件，不直接广播。
5. 服务器为每个玩家生成脱敏 `PublicGameState`。
6. 通过 `SYNC_STATE` 广播；对手手牌只暴露数量。
7. 游戏结束后异步写入比赛记录。

## 4. 初始化策略

前端只有一个 `boot()`。它按顺序创建 Store、WebSocketClient、事件代理、渲染器，再开放交互。任何步骤失败都进入可见的 fatal 状态，不允许静默跳过事件绑定。运行时不依赖 CDN 全局变量。

## 5. 一致性

- 每个游戏状态含单调递增 `revision`。
- 每个客户端动作含 `requestId`，服务端响应含同一 ID。
- 客户端只接受不小于当前 revision 的状态。
- 房间内命令按单线程事件循环顺序执行；一个房间同一时刻只应用一个命令。

## 6. 扩展方式

新增规则必须先：更新 `references/RULES.md`（用户批准）→ ADR → Domain 测试 → Domain 实现 → 协议/UI。禁止从 UI 直接“补一段 if”实现规则。

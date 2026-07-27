# ADR 0002：CSS 变量暗色模式

- Status: Accepted
- Date: 2026-07-26

## Context

整页 `filter: invert()` 会反转头像、Emoji、花色和阴影，且需要脆弱的二次反转补丁。

## Decision

所有语义颜色由 CSS Token 驱动，`html[data-theme="dark"]` 覆盖变量。禁止页面级反色滤镜。

## Consequences

暗色主题代码稍多，但视觉结果可预测、组件可测试，并避免图片负片。

# Prompt 示例

## 修复规则 Bug

```markdown
# TASK
TASK_ID: PW-0104
ROLE: domain-engine
OBJECTIVE: 修复红桃攻击被同花色免疫后仍然吸血的问题

## SOURCE OF TRUTH
- references/RULES.md §2.4：免疫时不吸血

## ALLOWED PATHS
- packages/domain/src/combat.ts
- packages/domain/test/combat.test.ts

## FORBIDDEN PATHS
- references/**
- apps/**

## INPUTS
- 当前：target.suit=H 时 hpDamage=0 但 lifesteal>0
- 期望：hpDamage=0 且 lifesteal=0

## NON-GOALS
- 不改变 A 无视免疫
- 不调整红桃 UI

## ACCEPTANCE CRITERIA
1. 新回归测试修复前失败、修复后通过
2. A+红桃命中红桃角色仍可造成伤害和吸血

## REQUIRED TESTS
- pnpm test
- pnpm typecheck

## CONSTRAINTS
- 最多 2 个文件
- 不新增依赖

## OUTPUT
Follow .hermes/prompts/OUTPUT_CONTRACT.md
```

## 新增 UI 组件

```markdown
# TASK
TASK_ID: PW-0210
ROLE: web-ui
OBJECTIVE: 为 10 秒 Joker 救援窗口增加可访问倒计时组件

## SOURCE OF TRUTH
- references/RULES.md §2.6
- docs/STYLE_SYSTEM.md §4–6

## ALLOWED PATHS
- apps/web/src/render.ts
- apps/web/src/style.css
- apps/web/src/ui/joker-timer.ts

## NON-GOALS
- 不改变服务器 deadline
- 不在客户端判定淘汰

## ACCEPTANCE CRITERIA
1. 使用服务器 deadlineAt 计算显示
2. 读屏每 5 秒播报，不每秒刷屏
3. reduced-motion 下无闪烁动画
```

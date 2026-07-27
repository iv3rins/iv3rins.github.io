# Hermes + DeepSeek V4 Pro Prompt 格式

每次只发送一个原子任务。Hermes 负责拆分、权限和验收；DeepSeek 只在允许路径内实现。

```markdown
# TASK
TASK_ID: PW-0001
ROLE: domain-engine | server | web-ui | qa | reviewer | ops
OBJECTIVE: 一句话描述可验证结果

## SOURCE OF TRUTH
- references/RULES.md §x
- docs/ADR/xxxx.md

## ALLOWED PATHS
- packages/domain/src/combat.ts
- packages/domain/test/combat.test.ts

## FORBIDDEN PATHS
- references/**
- apps/**

## INPUTS
- 当前行为：...
- 期望行为：...
- 复现步骤：...

## NON-GOALS
- 不改协议
- 不重构无关命名

## ACCEPTANCE CRITERIA
1. ...
2. ...

## REQUIRED TESTS
- ...

## CONSTRAINTS
- 最多 4 个文件
- 不新增依赖
- 不使用 any

## OUTPUT
严格按 .hermes/prompts/OUTPUT_CONTRACT.md

## STOP CONDITIONS
遇到规则冲突、破坏性接口或不可逆迁移时停止并报告。
```

禁止使用“完善一下”“全面优化”“你看着办”这类开放式目标。

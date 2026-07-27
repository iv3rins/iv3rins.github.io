# 来源冲突与裁决

## 权威顺序

`RULES.md` 是玩法真源；`POKEWAR_REFACTOR_GUIDE.md` 是失败经验；`design.md` 是初版视觉规范。

## 已裁决冲突

### 1. 玩家人数

- `RULES.md`：2–4 人。
- 重构指南 UI 草图提到“最高 12 人”。
- **裁决**：当前代码硬限制 2–4 人；布局组件避免写死人数，为未来扩展保留空间，但不开放 12 人。

### 2. 红桃免疫与吸血

- `RULES.md`：免疫时“不吸血”。
- 重构指南关联 Skill 摘要写“红桃吸血无条件”。
- **裁决**：依从规则文档。免疫时 `hpDamage=0`、`lifesteal=0`。

### 3. 暗色模式

- `design.md` 初版：整页 `filter: invert()`。
- 重构指南：纯 CSS 变量，零 `filter: invert()`。
- **裁决**：依从失败经验。使用变量覆盖，避免图片、Emoji、阴影和花色反相。

### 4. boardgame.io

- 旧代码依赖 CDN 全局变量，曾导致模块级联崩溃。
- **裁决**：默认权威服务器使用 `ws`；boardgame.io 只作为构建期可选适配器，禁止 CDN 和顶层全局读取。

### 5. lives 归属

规则文档把 `lives` 写在角色属性中，但启动协议以 `maxLives` 配置整局，旧构造器也以 `(playerCount, maxLives)` 创建引擎。

- **当前实现假设**：`livesRemaining` 属于玩家，角色是换将槽位。
- **状态**：`NEEDS_USER_DECISION`。若确认每个角色独立命数，需要新增 ADR 和迁移测试。

### 6. Joker 的作用域

- `RULES.md` 的简述是“单张复活死亡角色，双张斩杀”。
- 重构指南把动作收敛到 `WAITING_FOR_JOKER` 阶段和 10 秒濒死窗口。
- **当前实现**：单 Joker 仅允许濒死玩家自救；双 Joker 仅允许其他玩家在同一窗口内斩杀。
- **状态**：`NEEDS_USER_DECISION`。若 Joker 应可在任意时点复活任意已死角色，需要补充目标选择、回合恢复和角色槽位规则。

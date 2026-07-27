# Markdown 与代码开发准则

## 1. Markdown

- 每份文档只有一个 `#` 标题。
- 标题层级不能跳级；禁止用粗体代替标题。
- 规则语句使用“必须 / 禁止 / 应当”，说明语句使用陈述句。
- 所有命令必须放在带语言标记的代码块中。
- 所有路径用反引号包裹；相对路径以仓库根目录为基准。
- TODO 必须包含负责人、原因和退出条件：`TODO(owner, reason, exit-condition)`。
- 不写“之后优化”“暂时这样”等不可验收表达。
- ADR 使用 `docs/ADR/NNNN-title.md`，状态只允许 Proposed / Accepted / Superseded。

## 2. TypeScript

- `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 全开。
- 不使用 `any`、非空断言 `!`、TypeScript enum、默认导出。
- 领域层优先纯函数和只读参数；输入不原地修改。
- 单文件不超过 420 行；单函数建议不超过 60 行。
- 错误必须是可识别代码，不以用户文案作为分支条件。
- 时间、随机数、ID 通过依赖注入；测试不得依赖真实时钟和 `Math.random()`。
- 网络边界必须 Schema 校验；域内不重复做结构校验。

## 3. 命名

- 类型与类：`PascalCase`。
- 函数与变量：`camelCase`。
- 常量：仅真正全局不变量使用 `UPPER_SNAKE_CASE`。
- 领域动作使用动词：`playCards`、`selectStarter`。
- 领域事件使用过去式：`CardsPlayed`、`CharacterDying`。
- 布尔值使用 `is/has/can/should` 前缀。

## 4. 测试

- 规则测试采用 Given / When / Then 注释。
- 每条规则至少有正常、边界、拒绝三个用例。
- Bug 修复必须先添加会失败的回归测试。
- 测试只断言公共行为，不读取私有实现。
- 领域测试不得启动服务器、数据库或 DOM。

## 5. Git

提交格式：`type(scope): summary`。

允许类型：`feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`perf`、`security`。

一个提交只做一件事。禁止把自动格式化和业务变更混在同一提交。

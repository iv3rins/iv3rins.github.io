# PokeWar 前端 Agent 快速上手

## 1. 项目范围

PokeWar 是基于 Web 的多人卡牌游戏，支持 2–12 人。

前端主要位于：

- `apps/web/index.html`：页面结构、顶栏、弹窗等静态 DOM。
- `apps/web/src/render.ts`：状态驱动渲染，包括顶栏、页面和弹窗。
- `apps/web/src/style.css`：主题、布局、组件和响应式样式。
- `apps/web/src/main.ts`：事件绑定与应用入口。
- `apps/web/src/dom.ts`：DOM 辅助函数。

当前前端是原生 TypeScript + DOM，不是 React/Vue。

## 2. 必读约束

执行任何任务前必须遵循根目录 `AGENTS.md`：

1. `references/RULES.md` 是玩法唯一真源。
2. `docs/ADR/*.md` 是已批准架构决定。
3. 禁止修改 `references/`。
4. 单任务默认最多修改 8 个文件、400 行。
5. 不得跨多个业务边界，除非任务明确授权。
6. 不得改变玩法、协议、认证数据结构或后端行为。
7. 不得删除失败测试、降低断言或使用 `any` 绕过类型检查。
8. 完成前应运行 `pnpm verify`。
9. 无法确认的信息标记为 `NEEDS_USER_DECISION`。
10. 遇到规则冲突、未知测试基线、生产依赖、破坏性接口或不可逆迁移时停止编码。

还需读取：

- `.hermes/prompts/OUTPUT_CONTRACT.md`
- `docs/ADR/*.md`
- `docs/STYLE_SYSTEM.md`
- 当前目录下更深层的 `AGENTS.md`

## 3. 当前 UI 上下文

用户提供了三张参考图。

### 当前问题

1. 账号登录弹窗在登录/注册切换时存在布局跳动。
2. 所有弹窗右上角关闭按钮 `X` 应统一为红色。
3. 首页右上角组件尺寸和垂直对齐不一致。
4. 顶栏需要参考图三重新规划，保持紧凑、单行、稳定。

### 目标视觉

参考图三的顶栏顺序：

1. 语言入口，例如 `ZH`
2. 主题切换，例如 `浅色` / `深色`
3. 当前身份，例如 `访客#DFGG2`
4. 主操作按钮，例如 `登录 / 注册`

设计要求：

- 桌面端保持同一行、统一高度、统一基线。
- 不使用 `flex-wrap` 造成随机换行。
- 主题按钮应有文本，不只显示月亮 Emoji。
- 登录按钮是最醒目的主操作。
- 移动端允许明确的响应式降级，但不得溢出或重叠。
- 登录弹窗切换标签时宽高稳定。
- 关闭按钮使用 `--color-danger`，并保持足够对比度。
- 不改变现有认证逻辑和事件 `data-action`。

## 4. 已定位实现

### 顶栏结构

`apps/web/index.html` 当前包含：

- `.topbar`
- `.topbar-left`
- `.topbar-right`
- 主题按钮 `[data-action="toggle-theme"]`
- 动态认证区域 `#topbar-auth`

### 顶栏动态内容

`apps/web/src/render.ts` 中的 `renderTopbar(state)`：

- 根据主题更新主题按钮。
- 登录后渲染用户称号、头像、装扮和退出操作。
- 未登录时渲染访客头像、访客名和登录/注册按钮。

### 登录弹窗

`apps/web/index.html` 中：

- `#auth-modal`
- `.modal-header`
- `.modal-close`
- `.auth-tabs`
- `#auth-login-pane`
- `#auth-register-pane`

### 相关样式

`apps/web/src/style.css` 中：

- `.topbar`
- `.topbar-right`
- `.theme-toggle`
- `.guest-chip`
- `#topbar-auth`
- `.modal`
- `.modal-header`
- `.modal-close`
- `.auth-tabs`
- `.auth-pane`
- 响应式媒体查询

## 5. 建议任务边界

任务 ID：`PW-WEB-UI-20260726-01`

目标：

- 稳定登录/注册弹窗尺寸。
- 所有弹窗关闭按钮统一为红色。
- 重排首页右上角控制区。
- 完成后启动本地 Vite 测试服务器。

允许路径：

- `apps/web/index.html`
- `apps/web/src/render.ts`
- `apps/web/src/style.css`
- 必要且已存在的前端 UI 测试文件

禁止路径：

- `references/`
- `packages/domain/`
- 协议、服务器、数据库及认证接口
- 与本任务无关的业务模块

非目标：

- 不修改玩法。
- 不改变登录/注册提交逻辑。
- 不增加生产依赖。
- 不重构全站组件系统。
- 不修改用户数据结构。
- 不实现真实语言切换，除非用户另行授权。

## 6. 验收标准

1. 登录和注册标签来回切换时，弹窗位置和外框尺寸不跳动。
2. `auth-modal` 与 `cosmetics-modal` 的关闭按钮均为统一红色。
3. 关闭按钮 hover、focus、active 状态清晰。
4. 桌面端顶栏右侧控件统一高度并垂直居中。
5. 访客名称过长时截断，不挤压主操作按钮。
6. 顶栏不因状态重渲染产生明显尺寸变化。
7. 移动端 320px 宽度不出现文字重叠或横向溢出。
8. 登录、主题切换、访客入口、关闭弹窗行为保持可用。
9. 不改变认证、玩法或协议语义。
10. `pnpm verify` 全绿。

## 7. 最小测试集合

按以下顺序验证：

1. 前端类型检查或构建。
2. 相关 UI 测试。
3. `pnpm verify`。
4. 桌面截图检查：建议 1440×900。
5. 移动截图检查：建议 390×844。
6. 手动检查登录/注册反复切换。
7. 手动检查浅色和深色主题。
8. 手动检查访客和已登录状态。

## 8. 本地服务器

完成实现和验证后，在 `apps/web` 启动 Vite：

```powershell
pnpm dev --host 0.0.0.0



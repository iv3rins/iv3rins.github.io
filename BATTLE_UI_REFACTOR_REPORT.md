# PokeWar 对局界面 UI 重构 — 自检报告

> 提交: `8bf98e7` — `fix: prevent hand-area collapse, full CSS-variable dark mode, grid row locking`
>
> 文件: `css/style.css` (+114 / -61)

---

## 一、自检说明：先前代码导致 Bug 的具体 CSS 原因

### 1.1 深色模式文本吞噬

**根因：** CSS 变量系统不完整 + 大量硬编码颜色绕过变量。

| 位置 | 旧代码 | 问题 |
|------|--------|------|
| `.hero-stat` | `background: #FFF` | 暗色模式文字仍是黑色 → 白底黑字不变 |
| `.bento-card` | `background: #FFFFFF` | 同上 |
| `.bento-card-panel` | `background: #FFFFFF` | 同上 |
| `.input-glass` | `background: #FFF; color: #000` | 输入框在暗色模式下黑字白底 |
| `.btn-secondary` | `background: #FFF; color: #000` | 按钮文字不可见 |
| `.rule-subcard` | `background: #FFF; color: #000` | 规则卡片文字消失 |
| `#wr-chat-messages` | `background: #FFF; border: 2px solid #000` | 聊天框完全不可读 |
| `.profile-badge` | `background: #FFF` | 顶部头像区域文字消失 |
| `.wr-player-slot` | `background: #FFF; border: 3px solid #000` | 准备室座位文字消失 |
| `.room-code-display` | `background: #FFF; color: #000` | 房间码不可见 |
| `.avatar-option` | `background: #FFF` | 头像选择器背景异常 |

**结论：** `html.dark-theme` 虽然定义了 `--glass-bg: #1A1A1A` 和 `--text-main: #FFFFFF`，但上述 11 处选择器直接写了 `#FFF` / `#000`，完全绕过了变量系统。暗色模式下背景变黑但文字保持黑色 → 文字被"吞噬"。

### 1.2 手牌区域塌陷

**根因：** Grid 行高分配错误。

```css
/* 旧代码 */
.battle-shell {
  grid-template-rows: auto 1fr auto;  /* ← 致命 */
}
```

- 第一行 `auto` = 顶部阶段条高度
- 第二行 `1fr` = 中间战场区域拿走**所有剩余空间**
- 第三行 `auto` = 底部手牌区只分配内容所需最小高度

当 `.play-zone` 设置了 `flex: 1` 后，它会尽可能撑满中间行。如果视口高度不足（如 768px），中间行可能占用 400px+，底部行只剩几十 px。`.hand-bento` 的 `min-height: 160px` 无法生效，因为父 grid 行本身只有几十 px。

**结论：** `auto` 行高 + `flex: 1` 内容区 = 底部被挤压至 0。

### 1.3 区域划分混乱

**根因：** 旧 Grid 将角色面板和手牌区放在不同行：

```css
grid-template-areas:
  "left    center  right"
  "left    bottom  right";   /* 角色面板跨两行, 手牌只有一行 */
```

这导致：
- 角色面板 `align-self: end` 贴在第二行底部，与手牌区不在同一水平线
- 右侧聊天面板贯穿两行，高度不受控
- 中央战场 `flex: 1` 与底部手牌争抢空间

---

## 二、修复方案

### 2.1 全量 CSS 变量驱动

所有 `#FFF` / `#000` / `#FFFFFF` 硬编码颜色替换为变量：

```css
/* 典型修复模式 */
background: var(--glass-bg);    /* 替代 #FFF */
color: var(--text-main);        /* 替代 #000 */
border: 2px solid var(--text-main);  /* 替代 #000 */
box-shadow: 10px 10px 0px var(--text-main);  /* 替代 #000 */
```

涉及选择器（共 16 处）：
`hero-stat`, `bento-card`, `bento-card-panel`, `btn-secondary`, `btn-small`, `input-glass`, `rule-subcard`, `profile-badge`, `wr-player-slot`, `room-code-display`, `wr-chat-messages`, `avatar-option`, `phase-pill`, `identity-sticker`, `draw-pile`, `discard-pile`

### 2.2 Grid 行高锁定

```css
/* 新代码 */
.battle-shell {
  grid-template-rows: auto 1fr 200px;  /* ← 底部固定 200px, 永不塌陷 */
  grid-template-areas:
    "topbar  topbar  topbar"
    "left    center  right"
    "bottom  bottom  right";           /* 手牌跨 left+center 两列 */
}
```

**效果：**
- 顶部行：自适应阶段条高度
- 中间行：拿走剩余空间（战场 + 角色面板）
- 底部行：**固定 200px**，无论视口多小都不会塌陷
- 手牌区 `grid-area: bottom` 跨 `left + center` 两列，宽度充足

### 2.3 手牌区加固

```css
.hand-bento {
  width: 100%; height: 100%;    /* 撑满固定 200px 的父行 */
  background: var(--glass-bg);
  border: var(--border-thick);
}

.hand-area {
  height: 140px;                 /* 卡片显示区固定高度 */
  flex-shrink: 0;                /* 禁止弹性收缩 */
  display: flex;
  justify-content: center;
}
```

### 2.4 角色面板独立

```css
.battle-left {
  grid-area: left;
  align-self: start;             /* 顶部对齐, 不与手牌争空间 */
  overflow-y: auto;              /* 内容溢出可滚动 */
}
```

---

## 三、最终 Grid 布局

```
┌──────────────┬──────────────────────┬──────────────┐
│              │   phase-pill         │              │  ← auto (40px)
│   topbar     │   准备阶段 ⏱ 12      │   topbar     │
├──────────────┼──────────────────────┼──────────────┤
│              │  surrounding-players │              │
│  character   │  [对手1] [对手2]      │  info-log    │
│  bento       ├──────────────────────┤  panel       │  ← 1fr
│  ┌────┐     │   play-zone          │  ┌─────────┐ │
│  │头像│     │  [牌堆] ⚔️战区 [弃牌]  │  │ 对战日志 │ │
│  ├────┤     │                      │  │ msg...   │ │
│  │❤️10│     │                      │  │ msg...   │ │
│  │🛡️ 0│    │                      │  ├─────────┤ │
│  └────┘     │                      │  │[输入...] │ │
│             │                      │  │[ 发送 ] │ │
├──────────────┴──────────────────────┤  └─────────┘ │
│          hand-bento (200px)         │              │  ← 200px FIXED
│  [万化] [出牌] [取消]               │              │
│  🂡 🂢 🂣 🂤 🂥 🂦 🂧                │              │
└─────────────────────────────────────┴──────────────┘
```

---

## 四、验证结果

| 检查项 | 状态 | 证据 |
|--------|------|------|
| 底部行固定 200px | ✅ | `grid-template-rows: auto 1fr 200px` |
| 手牌区不塌陷 | ✅ | `height: 140px; flex-shrink: 0` |
| 零硬编码 `#FFF` 背景 | ✅ | `grep -c 'background: #FFF' = 0` |
| CSS 变量覆盖 | ✅ | `var(--glass-bg)` 27 处, `var(--text-main)` 33 处 |
| phase-pill 变量驱动 | ✅ | `background: var(--text-main)` |
| bento-card 变量驱动 | ✅ | `background: var(--glass-bg)` |
| input-glass 变量驱动 | ✅ | `background: var(--glass-bg); color: var(--text-main)` |
| JS 语法检查 | ✅ | 全部 8 个文件通过 `node --check` |
| API 正常 | ✅ | `GET /api/online → {"online":1}` |
| Git 已推送 | ✅ | `8bf98e7` on `origin/main` |

---

## 五、残留风险

1. **移动端响应式**：`@media (max-width: 768px)` 底部行固定 180px，在超小屏（< 360px）可能仍显拥挤，建议后续加 `@media (max-width: 400px)` 断点
2. **gameUI.js 渲染兼容**：HTML 元素 ID 未变（`hand-area`, `self-hp-val` 等），但新增了 `self-avatar-img` 替代旧 `self-avatar`，JS 已在之前提交中适配
3. **对手区渲染**：`surrounding-players` 的 `min-height: 50px` 可容纳 1-2 行对手卡片，12 人局可能溢出，需 JS 端控制渲染数量

# 🃏 PokeWar Design System (Neo-Brutalism)
**版本**: V1.0 
**风格基调**: 新粗野主义 (Neo-Brutalism) + 酸性设计 (Acid Graphics)
**核心约束**: 极高对比度、纯黑粗边框、硬核实体阴影、大字号重型排版、Bento Grid (便当盒) 布局。

---

## 1. 🎨 配色系统 (Color Palette)
本系统采用极简的背景搭配极具视觉冲击力的荧光色块。

*   **背景色 (Background)**: `#F4F4F0` (暖米白，绝不使用纯白)
*   **文字主色 (Text Main)**: `#000000` (纯黑)
*   **主跳色/强调色 (Accent Primary)**: `#CCFF00` (荧光酸性绿)
*   **辅助色 1 (Accent Secondary)**: `#0057FF` (电光蓝，多用于护盾/加入等次级动作)
*   **辅助色 2 (Accent Danger)**: `#FF00E6` (亮骚粉) 或 `#FF3B30` (Apple红，用于关闭/报错)
*   **🌓 黑夜模式规范 (Dark Mode)**: 
    *   不单独定义深色变量。直接通过 CSS 滤镜反转色相：`filter: invert(1) hue-rotate(180deg);`
    *   黑夜模式下背景底色必须强制加深：`background-color: #111;`
    *   图片 (`img`)、头像和 Emoji 必须二次反转以防变为负片。

## 2. 🔤 字体排版 (Typography)
严禁在正文中使用挤压、负间距或带描边的重型字体！字体的应用必须严格分层。

*   **一级/核心标题 (Heading & Numbers)**: 
    *   `font-family: 'Impact', 'Arial Black', sans-serif;`
    *   `font-weight: 900;`
    *   大标题字号：`3rem` - `5rem`；卡片标题：`1.5rem`
    *   **特效应用**：重要数字（如伤害、战绩）或顶级标题必须带有纯黑重型描边 `-webkit-text-stroke: 2.5px #000;` 和硬阴影 `text-shadow: 3px 3px 0px #000;`。
*   **正文排版 (Body Text)**:
    *   `font-family: 'Inter', system-ui, -apple-system, sans-serif;`
    *   `font-weight: 600;` (加粗以匹配粗野主义)
    *   `font-size: 1rem;` 到 `1.1rem;`
    *   `line-height: 1.6;` (弹窗或规则内的文字行高强制为 1.6，防止拥挤)
    *   **绝对禁止**：正文绝对不可使用 `-webkit-text-stroke` 或 `text-shadow`。

## 3. 📏 间距系统 (Spacing)
采用 8px 倍数的网格系统，保证 Bento Grid 的呼吸感。

*   **全局/模块间隙 (Gap)**: 
    *   Bento Grid 网格间隙 (Grid Gap): `16px`
    *   卡片内部元素间隙 (Flex Gap): `8px` 或 `12px`
*   **内边距 (Padding)**:
    *   基础按钮 (Button): `12px 24px`
    *   基础卡片 (Card): `20px` 或 `24px`
    *   弹窗容器 (Modal/Toast): `16px 24px`

## 4. 🧩 核心组件样式规则 (Components)
所有的组件（卡片、按钮、弹窗）必须遵守**“粗黑线框 + 纯黑硬阴影”**的法则。

*   **边框 (Borders)**: 所有卡片、按钮、输入框统一使用 `3px solid #000000;` (不能发灰，必须 `#000`)
*   **圆角 (Border Radius)**:
    *   Bento 卡片 (Card): `12px`
    *   按钮与弹窗 (Button/Modal): `8px`
    *   表单输入框 (Input/Select): `6px`
    *   关闭按钮 (Close Btn): `50%` (绝对正圆)
*   **阴影 (Box Shadows - 无模糊值)**:
    *   默认状态：`6px 6px 0px #000000;`
    *   Hover 状态（卡片/按钮）：`10px 10px 0px #000000;` 配合 `transform: translate(-4px, -4px);`
*   **悬浮关闭按钮 (Close Button - 红叉)**:
    *   必须绝对定位，突破边框约束（如：`top: -10px; right: -10px;`）
    *   宽高 `32px`，红色背景 `#FF3B30`，白色十字，黑边黑阴影。

---

## 💻 5. 开发者演示代码 (Demo Code for AI UI Generation)
AI 助手在生成本项目的 UI 时，请直接套用并参考以下核心 CSS 类名和 DOM 结构：

```html
<!-- HTML 结构演示 -->
<div class="bento-card">
    <h2 class="neo-heading">创建房间</h2>
    <p class="neo-body">选择游戏模式并邀请好友加入战斗。</p>
    <select class="neo-input">
        <option>2 人对战</option>
        <option>4 人混战</option>
    </select>
    <button class="neo-btn primary">🔥 立即创建</button>
</div>

<!-- 绝对悬浮的红叉关闭按钮 -->
<button class="close-modal-btn">X</button>

<style>
/* 基础变量 */
:root {
    --bg-color: #F4F4F0;
    --text-main: #000;
    --primary: #CCFF00;
    --border-thick: 3px solid #000;
    --shadow-hard: 6px 6px 0px #000;
    --shadow-hover: 10px 10px 0px #000;
    --font-heading: 'Impact', 'Arial Black', sans-serif;
    --font-body: 'Inter', system-ui, sans-serif;
}

/* 核心组件: Bento卡片 */
.bento-card {
    background: #FFF;
    border: var(--border-thick);
    box-shadow: var(--shadow-hard);
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s ease;
}
.bento-card:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-4px, -4px);
}

/* 核心组件: Neo按钮 */
.neo-btn {
    background: #FFF;
    border: var(--border-thick);
    box-shadow: 4px 4px 0px #000;
    border-radius: 8px;
    padding: 12px 24px;
    font-family: var(--font-heading);
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.1s;
}
.neo-btn.primary { background: var(--primary); }
.neo-btn:active {
    box-shadow: 0px 0px 0px #000;
    transform: translate(4px, 4px);
}

/* 核心组件: 输入框/下拉框 */
.neo-input {
    width: 100%;
    border: var(--border-thick);
    border-radius: 6px;
    padding: 12px;
    font-family: var(--font-body);
    font-weight: 600;
    box-sizing: border-box;
    margin-bottom: 16px;
}
.neo-input:focus {
    outline: none;
    background: var(--primary);
}

/* 核心排版 */
.neo-heading {
    font-family: var(--font-heading);
    -webkit-text-stroke: 1.5px #000;
    color: var(--primary);
    text-shadow: 2px 2px 0px #000;
    letter-spacing: 1px;
}
.neo-body {
    font-family: var(--font-body);
    font-weight: 600;
    line-height: 1.6;
    color: var(--text-main);
}

/* 突破边框的红叉关闭按钮 */
.close-modal-btn {
    position: absolute;
    top: -12px;
    right: -12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #FF3B30;
    color: #FFF;
    border: var(--border-thick);
    box-shadow: 2px 2px 0px #000;
    font-family: var(--font-heading);
    cursor: pointer;
    z-index: 10;
}
</style>
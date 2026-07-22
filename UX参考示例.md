# 🎨 可爱大乱斗 (Cute Brawl) - UI/UX 样式参考与使用示例

为了解决 AI 自动生成代码时常见的“布局丑陋”、“UX 不对齐”等问题，我为你重新设计了一套现代、可爱且具备良好交互反馈的 CSS 规范。

你可以直接将这份 Markdown 文档提供给 DeepSeek V4 Pro，让它以此为基准，替换或更新项目中的 `style.css` 和 DOM 结构。

---

## 1. 核心修复与体验优化 (UX Improvements)

1.  **聊天气泡 (Chat Bubbles)**：
    *   **修复前**：气泡宽度无限延伸，长文本撑爆容器，敌我消息视觉差异小，缺乏尾巴和对齐。
    *   **修复后**：使用 Flexbox `align-self` 控制左右对齐，添加 `word-break: break-word` 和 `max-width: 80%`，并在气泡底部边角做不对称圆角（模拟对话气泡尾巴）。
2.  **目标选择 (Target Selection)**：
    *   **修复前**：选中状态只加了个边框，不明显。
    *   **修复后**：加入柔和的缩放 (`scale(1.05)`)、呼吸灯动画 (`pulse`) 以及卡片上浮效果，让玩家明确知道当前锁定了谁。
3.  **手牌交互 (Hand Cards)**：
    *   **修复前**：卡牌层叠生硬，选中和悬浮状态容易重叠冲突。
    *   **修复后**：利用负边距 `margin-left` 实现自然的扇形/层叠排布。悬浮时增加 `z-index` 和大幅上浮，选中时加入发光边框。
4.  **色彩与圆角 (Colors & Radii)**：
    *   抛弃生硬的直角和原色，全面采用大圆角 (`border-radius: 20px`)、低饱和度马卡龙色系（粉、薄荷绿、浅蓝）以及弥散阴影 (`box-shadow`)。

---

## 2. 完整 CSS 样式参考 (`style.css`)

请让 Agent 用以下 CSS 覆盖原有的样式表。

```css
/* =========================================
   1. 基础变量与重置
   ========================================= */
:root {
    --bg-color: #fef6f5;       /* 整体背景 - 暖粉白 */
    --primary: #ffb6c1;        /* 主色调 - 樱花粉 */
    --primary-hover: #ff9fb0;
    --text-main: #2d3436;      /* 主文本 - 深灰 */
    --text-muted: #636e72;     /* 次文本 - 浅灰 */
    --hp-color: #ff7675;       /* 生命值 - 橘红 */
    --shield-color: #74b9ff;   /* 护盾值 - 天蓝 */
    --self-border: #4facfe;    /* 己方高亮 - 亮蓝 */
    --card-bg: #ffffff;
    --font-family: 'Nunito', 'Comic Sans MS', 'Microsoft YaHei', sans-serif;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    user-select: none; /* 游戏界面防止文本误选 */
}

body {
    background: var(--bg-color);
    color: var(--text-main);
    font-family: var(--font-family);
    overflow: hidden; /* 防止出现外层滚动条 */
    width: 100vw;
    height: 100vh;
}

/* =========================================
   2. 通用组件 (Buttons, Inputs, Scrollbars)
   ========================================= */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 10px; }

.btn {
    background: var(--primary);
    color: #fff;
    border: none;
    padding: 12px 24px;
    border-radius: 25px; /* 圆润按钮 */
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 0 rgba(200, 130, 140, 0.3), 0 8px 15px rgba(0, 0, 0, 0.08);
}

.btn:hover:not(:disabled) {
    transform: translateY(-2px);
    filter: brightness(1.05);
}

.btn:active:not(:disabled) {
    transform: translateY(4px);
    box-shadow: 0 0 0 rgba(200, 130, 140, 0.3); /* 按下时去掉底部投影 */
}

.btn:disabled {
    background: #dfe6e9;
    color: #b2bec3;
    box-shadow: 0 4px 0 #b2bec3;
    cursor: not-allowed;
}

/* =========================================
   3. 聊天系统 UX 优化 (核心修复)
   ========================================= */
.chat-sidebar {
    width: 320px;
    background: #fff;
    border-radius: 25px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
    border: 3px solid #f1f2f6;
}

.chat-messages {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px; /* 消息之间的间距 */
}

.chat-bubble-container {
    display: flex;
    flex-direction: column;
    max-width: 85%; /* 防止太长 */
}

.chat-sender-name {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 4px;
    padding: 0 4px;
}

.chat-bubble {
    padding: 10px 15px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word; /* 关键：解决长英文/乱码溢出 */
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}

/* 己方消息：靠右，气泡红色，尾巴在右下角 */
.chat-bubble-container.self {
    align-self: flex-end;
    align-items: flex-end;
}
.chat-bubble-container.self .chat-bubble {
    background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
    color: #fff;
    border-bottom-right-radius: 4px; /* 模拟聊天尾巴 */
}

/* 对方消息：靠左，气泡白色，尾巴在左下角 */
.chat-bubble-container.other {
    align-self: flex-start;
    align-items: flex-start;
}
.chat-bubble-container.other .chat-bubble {
    background: #fff;
    color: var(--text-main);
    border: 2px solid #f1f2f6;
    border-bottom-left-radius: 4px;
}

/* 系统消息：居中，变灰 */
.msg.system {
    align-self: center;
    background: #f1f2f6;
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    margin: 8px 0;
}

/* =========================================
   4. 游戏对局卡片与目标选择 UX
   ========================================= */
.player-card {
    background: var(--card-bg);
    border: 3px solid #f1f2f6;
    border-radius: 20px;
    width: 120px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 5px 15px rgba(0,0,0,0.03);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    position: relative;
    cursor: pointer;
}

/* 可被攻击目标悬浮反馈 */
.player-card.targetable:hover {
    border-color: var(--primary);
    transform: translateY(-8px);
    box-shadow: 0 10px 25px rgba(255, 182, 193, 0.4);
}

/* 锁定目标时的强视觉反馈 */
@keyframes pulseTarget {
    0% { box-shadow: 0 0 0 0 rgba(255, 118, 117, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(255, 118, 117, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 118, 117, 0); }
}
.player-card.targeted {
    border-color: var(--hp-color) !important;
    background: #fff0f0;
    transform: translateY(-10px) scale(1.05);
    animation: pulseTarget 1.5s infinite;
}

/* 头像微动画 */
.cute-bounce { animation: bounceHover 3s ease-in-out infinite; }
@keyframes bounceHover {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
}

/* =========================================
   5. 手牌层叠交互 UX
   ========================================= */
.hand-area {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding: 20px;
    min-height: 160px;
}

.poker-card {
    width: 80px;
    height: 115px;
    background: white;
    border: 2px solid #dfe6e9;
    border-radius: 8px;
    box-shadow: -4px 0 15px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    font-weight: bold;
    margin-left: -30px; /* 负边距实现扇形层叠 */
    transition: transform 0.2s, z-index 0s, margin 0.2s;
    cursor: pointer;
    position: relative;
}

.poker-card:first-child { margin-left: 0; }

.poker-card:hover {
    transform: translateY(-20px);
    z-index: 100; /* 悬浮时置顶 */
}

/* 选中出牌的强反馈 */
.poker-card.selected {
    transform: translateY(-30px);
    border-color: var(--primary);
    border-width: 3px;
    box-shadow: 0 15px 30px rgba(255, 182, 193, 0.5);
    z-index: 50;
}
```

---

## 3. DOM 结构示例 (HTML Reference)

让 Agent 在生成 JS 渲染逻辑（如 `renderChatBubble`, `renderOpponents`）时，严格遵循以下 HTML 结构，以确保 CSS 能够完美挂载。

### 💬 聊天列表渲染规范 (JS 注入 DOM 示例)
```html
<div class="chat-messages" id="game-chat-messages">
    
    <!-- 系统消息 -->
    <div class="msg system">✨ 玩家小明 加入了房间</div>
    
    <!-- 其他人的消息 (isSelf === false) -->
    <div class="chat-bubble-container other">
        <div class="chat-sender-name">小红 🐱</div>
        <div class="chat-bubble">不要打我好不好 🥺</div>
    </div>

    <!-- 自己的消息 (isSelf === true) -->
    <div class="chat-bubble-container self">
        <div class="chat-sender-name">我 🐶</div>
        <div class="chat-bubble">吃我一发大火球！💥</div>
    </div>
    
</div>
```

### 🃏 玩家卡牌渲染规范
```html
<!-- 必须包含 data-playerId 供事件绑定，添加 targetable 类表示当前可被选择 -->
<div class="player-card targetable" data-playerId="1">
    
    <!-- 头像动画 -->
    <div class="avatar cute-bounce" style="font-size: 40px;">🐰</div>
    
    <!-- 名字 -->
    <div class="name" style="font-weight: bold; margin-top: 8px;">兔兔杀手</div>
    
    <!-- 当前角色牌 -->
    <div class="role suit-red" style="color: #ff7675; font-size: 20px; font-weight: 900;">
        ♥Q
    </div>
    
    <!-- 血条与护盾条 -->
    <div style="font-size: 11px; color: #636e72;">40/40 +5🛡</div>
    <div class="status-bar" style="width: 100%; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-top: 4px; position: relative;">
        <!-- 血量背景 -->
        <div class="status-hp" style="width: 100%; height: 100%; background: #ff7675; transition: width 0.3s;"></div>
        <!-- 护盾覆盖其上，使用半透明或不同颜色 -->
        <div class="status-shield" style="width: 12.5%; height: 100%; background: #74b9ff; position: absolute; top:0; left:0;"></div>
    </div>
    
    <!-- 存活角色指示器 (点数) -->
    <div class="char-dots" style="margin-top: 8px;">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#55efc4; margin:0 2px;"></span>
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#55efc4; margin:0 2px;"></span>
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dfe6e9; margin:0 2px;"></span> <!-- 阵亡 -->
    </div>
    
    <!-- 手牌数角标 -->
    <div class="hand-count" style="position: absolute; bottom: -10px; right: -10px; background: #2d3436; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
        5
    </div>
</div>
```

/**
 * AudioManager — 音频管理器
 *
 * ★ 修复 2: 浏览器自动播放策略 (Autoplay Policy)
 *   - 加入 _unlocked 门控：首次用户交互前静默，交互后解锁
 *   - AudioContext.resume() 兼容 Web Audio API 浏览器
 *   - 解锁前的声音自动排队，解锁后一次性放出
 *   - Audio 对象创建时加 preload='auto' 但不触发 play
 *
 * 用法:
 *   audioManager.play('click');          // 播放指定音效
 *   audioManager.unlock();               // 用户首次交互后调用
 */
class AudioManager {
  constructor() {
    /** 是否已通过用户交互解锁 */
    this._unlocked = false;
    /** 解锁前排队的音效名称 */
    this._pendingQueue = [];
    /** 最大排队数量，防止内存泄漏 */
    this._maxQueue = 20;

    // ── 音效定义 ──
    // ★ 修复: Audio 构造时不调用 play()，只预加载
    //         所有 play 操作必须经过 _safePlay() 门控
    this.sounds = {};
    this._soundDefs = {
      attack: { src: 'https://actions.google.com/sounds/v1/foley/whoosh_heavy.ogg', volume: 0.5 },
      heal:   { src: 'https://actions.google.com/sounds/v1/bells/toll_cluster.ogg', volume: 0.5 },
      error:  { src: 'https://actions.google.com/sounds/v1/ui/navigation_cancel.ogg', volume: 0.5 },
      draw:   { src: 'https://actions.google.com/sounds/v1/water/wood_block_drop.ogg', volume: 0.5 },
      click:  { src: 'https://actions.google.com/sounds/v1/ui/pop.ogg', volume: 0.3 },
      select: { src: 'https://actions.google.com/sounds/v1/foley/movement_whoosh.ogg', volume: 0.4 },
      shield: { src: 'https://actions.google.com/sounds/v1/science_fiction/metallic_clink.ogg', volume: 0.5 },
      joker:  { src: 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg', volume: 0.5 },
    };

    // ★ 惰性初始化：Audio 对象在第一次 play 时才创建
    //   避免在页面加载时触发浏览器的 NotSupportedError
    this._audioCache = {};
  }

  // ═══════════════════════════════════════
  // ★ 核心修复：用户交互解锁
  // ═══════════════════════════════════════

  /**
   * 解锁音频 — 必须在用户首次点击/触摸/按键后调用
   *
   * 执行步骤:
   *   1. 播放静音 Audio 确认 HTMLAudioElement 通道畅通
   *   2. 尝试 AudioContext.resume() 解锁 Web Audio API (兼容性)
   *   3. 标记 _unlocked = true
   *   4. 刷新排队中的所有音效
   */
  unlock() {
    if (this._unlocked) return;
    console.log('[Audio] 正在解锁音频上下文...');

    // Step 1: HTMLAudioElement 通道
    // 播放一个极短的静默 WAV 确认浏览器允许声音
    const s = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    s.volume = 0;
    const p1 = s.play().then(() => {
      s.remove();
    }).catch(err => {
      console.warn('[Audio] HTMLAudioElement 解锁失败:', err.message);
    });

    // Step 2: Web Audio API 通道 (如果可用)
    let p2 = Promise.resolve();
    try {
      // 在用户手势中创建 AudioContext（某些浏览器要求）
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') {
        p2 = ctx.resume().then(() => {
          console.log('[Audio] AudioContext 状态:', ctx.state);
          ctx.close();
        }).catch(() => {});
      } else {
        ctx.close();
      }
    } catch (e) {
      // 浏览器不支持 Web Audio API — 正常
    }

    // Step 3: 等待解锁完成 → 放行排队音效
    Promise.all([p1, p2]).then(() => {
      this._unlocked = true;
      console.log('[Audio] 音频已解锁 ✓ 排队音效:', this._pendingQueue.length);
      this._flushQueue();
    });
  }

  /** 播放所有排队的音效 */
  _flushQueue() {
    const queue = [...this._pendingQueue];
    this._pendingQueue = [];
    for (const name of queue) {
      this._playImmediate(name);
    }
  }

  // ═══════════════════════════════════════
  // 公开 API
  // ═══════════════════════════════════════

  /**
   * 播放音效
   * @param {string} name - 音效名称 (attack/heal/error/draw/click/select/shield/joker)
   */
  play(name) {
    // ★ 门控: 未解锁时 → 排队等待
    if (!this._unlocked) {
      if (this._pendingQueue.length < this._maxQueue) {
        this._pendingQueue.push(name);
      }
      return;
    }

    this._playImmediate(name);
  }

  // ═══════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════

  /**
   * 立即播放 (假定已解锁)
   */
  _playImmediate(name) {
    const def = this._soundDefs[name];
    if (!def) { console.warn(`[Audio] 未知音效: ${name}`); return; }

    try {
      // ★ 每次 clone 一个 Audio 元素，支持快速连续播放
      let src = this._audioCache[name];
      if (!src) {
        src = new Audio(def.src);
        src.preload = 'auto';
        this._audioCache[name] = src;
      }

      const clone = src.cloneNode(true);
      clone.volume = def.volume ?? 0.5;
      clone.play().catch(err => {
        // 如果仍然被拦截（极少情况），静默失败
        if (err.name === 'NotAllowedError') {
          console.warn(`[Audio] 播放被拦截 (NotAllowedError): ${name} — 可能需要重新解锁`);
          this._unlocked = false; // 标记需要重新解锁
        } else {
          console.warn(`[Audio] 播放失败: ${name}`, err.message);
        }
      });
    } catch (e) {
      console.error(`[Audio] 播放异常: ${name}`, e);
    }
  }
}

// ── 单例 ──
export const audioManager = new AudioManager();

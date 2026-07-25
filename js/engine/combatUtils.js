/**
 * combatUtils.js — 核心战斗结算模块
 *
 * 架构：纯函数，零副作用，不依赖任何全局变量。
 * 可在 boardgame.io moves、AI 模拟、单元测试中直接调用。
 *
 * 规则来源：RULES.md + pokewar-advanced-game-mechanics skill
 *
 * 花色规则速查：
 *   ♠ 黑桃 → 双倍伤害（免疫时跳过）
 *   ♥ 红桃 → 吸血 = 最终伤害（免疫时跳过）
 *   ♦ 方块 → 五谷丰登标记（免疫时跳过）
 *   ♣ 梅花 → 穿透护盾（物理结算，不受免疫影响）
 *   A  万化 → 无视免疫（isAlmighty）
 *
 * 强约束：
 *   - 免疫只免除"花色特效"，不免除"基础伤害"
 *   - A 牌（isAlmighty）无视一切免疫
 */

/**
 * 计算一次攻击的完整战斗结算
 *
 * @param {string}  attackSuit   - 攻击花色 (♠|♥|♣|♦|A)
 * @param {number}  attackValue  - 攻击总点数（含 A 的 +1）
 * @param {object}  targetChar   - 目标角色 { suit, hp, maxHp, shield }
 * @param {object}  attackerChar - 攻击者角色 { suit }（用于 ♣ 穿透判定）
 * @returns {{
 *   finalDamage:    number,   // 最终实际伤害（已扣除护盾）
 *   lifesteal:      number,   // 吸血量（♥ 专属）
 *   triggerHarvest: boolean,  // 是否触发五谷丰登（♦ 专属）
 *   isImmune:       boolean,  // 是否触发同花色免疫
 *   isDouble:       boolean,  // 是否双倍（♠ 专属）
 *   shieldBlocked:  number,   // 护盾吸收的伤害量
 * }}
 */
export function calculateCombatResult(attackSuit, attackValue, targetChar, attackerChar = {}) {
  // ═══ 空值保护 ═══
  if (!targetChar) {
    return { finalDamage: 0, lifesteal: 0, triggerHarvest: false, isImmune: false, isDouble: false, shieldBlocked: 0 };
  }

  // 1. 基础伤害永远存在
  let finalDamage = Math.max(0, Math.floor(attackValue || 0));
  let lifesteal = 0;
  let triggerHarvest = false;
  let isImmune = false;
  let isDouble = false;
  let shieldBlocked = 0;

  // 2. 万化牌 (A) 判定：A 牌无视任何免疫
  const isAlmighty = (attackSuit === 'A');

  // 3. 同花色免疫判定：目标花色 === 攻击花色，且不是 A 牌
  //    强约束：免疫只免除"特效"，不免除"基础伤害"
  if (targetChar.suit === attackSuit && !isAlmighty) {
    isImmune = true;
  }

  // 4. 黑桃 (♠) 双倍判定：未被免疫时，伤害翻倍
  if (attackSuit === '♠' && !isImmune) {
    finalDamage *= 2;
    isDouble = true;
  }

  // 5. 护盾与穿透判定
  //    ♣ 梅花攻击 → 穿透护盾（物理结算，不受免疫影响）
  //    ♣ 角色属性 → 穿透护盾（角色被动）
  const isArmorPiercing = (attackSuit === '♣') || (attackerChar && attackerChar.suit === '♣');

  const currentShield = Number(targetChar.shield) || 0;

  if (!isArmorPiercing && currentShield > 0) {
    if (finalDamage >= currentShield) {
      // 伤害足以击穿护盾
      shieldBlocked = currentShield;
      finalDamage -= currentShield;
    } else {
      // 伤害被护盾完全吸收
      shieldBlocked = finalDamage;
      finalDamage = 0;
    }
  }
  // 穿透时 shieldBlocked=0，护盾不被消耗（穿透效果）

  // 6. 红桃 (♥) 吸血判定：未被免疫时，吸血量 = 最终实际伤害
  if (attackSuit === '♥' && !isImmune && finalDamage > 0) {
    lifesteal = finalDamage;
  }

  // 7. 方块 (♦) 五谷丰登判定：未被免疫时，触发全场摸牌
  if (attackSuit === '♦' && !isImmune) {
    triggerHarvest = true;
  }

  return {
    finalDamage,
    lifesteal,
    triggerHarvest,
    isImmune,
    isDouble,
    shieldBlocked,
  };
}

/**
 * ★ 批量计算：用于多张牌组合攻击时的结算
 *
 * @param {object} options
 * @param {string}  options.declaredSuit - 声明的攻击花色（含 A 万化后的花色）
 * @param {number}  options.totalValue   - 总点数
 * @param {boolean} options.hasA         - 是否含 A（万化）
 * @param {object}  options.targetChar   - 目标角色
 * @param {object}  options.attackerChar - 攻击者角色
 * @returns {object} 同 calculateCombatResult
 */
export function resolveAttack(options = {}) {
  const {
    declaredSuit = '♠',
    totalValue = 0,
    hasA = false,
    targetChar = null,
    attackerChar = {},
  } = options;

  // ★ 空值保护
  if (!targetChar) {
    return { finalDamage: 0, lifesteal: 0, triggerHarvest: false, isImmune: false, isDouble: false, shieldBlocked: 0 };
  }

  // A 万化 → 免疫判定用 'A'（无视免疫），但花色特效仍用 declaredSuit
  // 所以分两步：先算免疫，再算特效
  const isAlmighty = hasA;
  let isImmune = false;

  // 免疫判定：A 牌无视
  if (targetChar.suit === declaredSuit && !isAlmighty) {
    isImmune = true;
  }

  // 用 declaredSuit 计算特效（因为 declaredSuit 才是实际花色）
  // 但免疫状态已由上面判定
  let finalDamage = Math.max(0, Math.floor(totalValue || 0));
  let lifesteal = 0;
  let triggerHarvest = false;
  let isDouble = false;
  let shieldBlocked = 0;

  // ♠ 双倍
  if (declaredSuit === '♠' && !isImmune) {
    finalDamage *= 2;
    isDouble = true;
  }

  // 护盾穿透
  const isArmorPiercing = (declaredSuit === '♣') || (attackerChar && attackerChar.suit === '♣');
  const currentShield = Number(targetChar.shield) || 0;

  if (!isArmorPiercing && currentShield > 0) {
    if (finalDamage >= currentShield) {
      shieldBlocked = currentShield;
      finalDamage -= currentShield;
    } else {
      shieldBlocked = finalDamage;
      finalDamage = 0;
    }
  }

  // ♥ 吸血
  if (declaredSuit === '♥' && !isImmune && finalDamage > 0) {
    lifesteal = finalDamage;
  }

  // ♦ 五谷丰登
  if (declaredSuit === '♦' && !isImmune) {
    triggerHarvest = true;
  }

  return { finalDamage, lifesteal, triggerHarvest, isImmune, isDouble, shieldBlocked };
}

/**
 * ★ 生成战斗日志文本（供 gameUI 渲染播报板）
 *
 * @param {object} result — calculateCombatResult 的返回值
 * @param {string} attackerName
 * @param {string} targetName
 * @param {string} declaredSuit
 * @param {number} totalValue
 * @returns {string}
 */
export function formatCombatLog(result, attackerName, targetName, declaredSuit, totalValue) {
  if (!result) return '';

  const parts = [`⚔️ ${attackerName} → ${targetName} ${declaredSuit} ${totalValue}点`];

  if (result.isDouble) parts.push('[双倍!]');
  if (result.shieldBlocked > 0) parts.push(`(护盾吸收${result.shieldBlocked})`);
  parts.push(`实伤${result.finalDamage}`);

  if (result.isImmune) parts.push('[免疫特效]');
  if (result.lifesteal > 0) parts.push(`[吸血${result.lifesteal}]`);
  if (result.triggerHarvest) parts.push('[五谷丰登]');

  return parts.join(' ');
}

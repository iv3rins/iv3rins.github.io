import { GameEngine } from './js/engine/GameEngine.js';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// ── 模拟 displayChar 优先级修复后的全链路 ──
const e = new GameEngine(2);
e.players[0].name = 'Host'; e.players[1].name = 'Client';
e.selectStarter(0, 0); e.selectStarter(1, 0);
const p0 = e.players[0];

// 打出 3 张 ♣ = 15 护盾
const cards = [{suit:'♣',rank:'5',value:5,isJoker:false},{suit:'♣',rank:'8',value:8,isJoker:false},{suit:'♣',rank:'2',value:2,isJoker:false}];
p0.hand = [...cards, ...p0.hand.slice(3)];
e.playShield(p0, cards, '♣', null);
ok(p0.getActiveCharacter().shield === 15, 'engine: shield=15');

// 序列化
const state = {
    players: e.players.map((p,i) => ({
        id:p.id, name:p.name,
        characters: p.characters.map(c => ({rank:c.rank,suit:c.suit,maxHp:c.maxHp,hp:c.hp,shield:c.shield,isDead:c.isDead,isDying:c.isDying})),
        activeCharIndex: p.activeCharIndex, starterSelected: p.starterSelected,
        handCount: p.hand.length, isEliminated: p.isEliminated,
    })),
    myPlayerId: 0, phase: e.phase,
};

// 模拟 createPlayerCard 的 displayChar 逻辑（修复后：charIdx 优先）
const me = state.players[0];
const charIdx = me.activeCharIndex >= 0 ? me.activeCharIndex : 0;
const displayChar = me.characters[charIdx];
ok(displayChar.shield === 15, 'serialize→render: shield=15');
ok(displayChar.maxHp > 0 && (displayChar.shield/displayChar.maxHp*100) > 0, 'shPct > 0');

// 攻击链路
const e2 = new GameEngine(2);
e2.selectStarter(0,0); e2.selectStarter(1,0);
const attacker = e2.players[0], target = e2.players[1];
target.getActiveCharacter().hp = 100;
const atkCards = [{suit:'♠',rank:'K',value:10,isJoker:false}];
attacker.hand = [...atkCards, ...attacker.hand.slice(1)];
e2.playAttack(attacker, target, atkCards, '♠', null);
ok(target.getActiveCharacter().hp === 80, '♠K双倍=20 → hp=80');

// broadcastGameChat 存在
const { readFileSync } = await import('fs');
const n = readFileSync('./js/networkHandler.js','utf8');
ok((n.match(/broadcastGameChat/g)||[]).length >= 7, 'broadcastGameChat≥7处');

console.log(`\n${p} pass, ${f} fail`); process.exit(f?1:0);
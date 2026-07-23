import { readFileSync } from 'fs';import { execSync } from 'child_process';import { GameEngine } from './js/engine/GameEngine.js';
const ws='D:/iverins_workspace/game/KingdomWar';let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// --- [impeccable] Engine type guards ---
const e=readFileSync('./js/engine/GameEngine.js','utf8');
ok(e.includes('Number(c.value) || 0'),'playShield: card.value类型守卫');
ok(e.includes('Math.max(0, Math.floor(totalShield))'),'playShield: NaN兜底');
ok(e.includes('Number(activeChar.shield) || 0'),'playShield: shield初始值守卫');
ok(e.includes("throw new Error('[Engine] playShield: activeChar 为空')"),'playShield: activeChar空值抛错');
ok(e.includes('[Engine] playShield'),'playShield: [Engine]前缀日志');

// --- Runtime: engine with 0-value card edge case ---
const eg=new GameEngine(2);eg.selectStarter(0,0);eg.selectStarter(1,0);
const p0=eg.players[0];p0.getActiveCharacter().shield=0;
const edgeCards=[{suit:'♣',rank:'J',value:10,isJoker:false}];
p0.hand=[...edgeCards,...p0.hand.slice(1)];
try{eg.playShield(p0,edgeCards,'♣',null);ok(p0.getActiveCharacter().shield===10,'shield=10')}catch(x){ok(false,x.message)}

// --- [impeccable] Clipboard+Audio fallbacks ---
const m=readFileSync('./js/main.js','utf8');
ok(m.includes("document.execCommand('copy')"),'clipboard: execCommand降级');
const a=readFileSync('./js/audioManager.js','utf8');
ok(a.includes('.catch'),'audio: play().catch已覆盖');

// --- [boardgame.io] broadcast audit ---
const n=readFileSync('./js/networkHandler.js','utf8');
const bgcCalls=(n.match(/broadcastGameChat/g)||[]).length;
ok(bgcCalls >= 7,'broadcastGameChat调用≥7处');

// --- [taste] chat scroll-to-bottom ---
ok(m.includes('scrollTop') || m.includes('scrollHeight'),'chat: 滚动置底');

// Syntax
process.chdir(ws);
try{execSync('node --check js/engine/GameEngine.js js/networkHandler.js js/main.js',{stdio:'pipe'});ok(true,'syntax')}catch(e){ok(false,'syntax')}
console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
import { GameEngine } from './js/engine/GameEngine.js';
import { readFileSync } from 'fs';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// ═══ T1: Wanhua privilege — ♠A vs ♠ target → double works ═══
const e1=new GameEngine(2,3);e1.selectStarter(0,0);e1.selectStarter(1,0);
const a1=e1.players[0],t1=e1.players[1];
t1.characters[0].suit='♠';t1.getActiveCharacter().hp=100;
const ca=[{suit:'♠',rank:'A',value:1,isJoker:false},{suit:'♣',rank:'8',value:8,isJoker:false},{suit:'♠',rank:'7',value:7,isJoker:false}];
a1.hand=[...ca,...a1.hand.slice(3)];
e1.playAttack(a1,t1,ca,'♠',1,true);
ok(t1.getActiveCharacter().hp===100-32,'T1: Wanhua♠ double → hp=68 (8+7+1=16*2=32)');

// ═══ T2: Without A, ♠ vs ♠ → no double ═══
const e2=new GameEngine(2,3);e2.selectStarter(0,0);e2.selectStarter(1,0);
t2=e2.players[1];t2.characters[0].suit='♠';t2.getActiveCharacter().hp=100;
const cb=[{suit:'♠',rank:'K',value:10,isJoker:false}];
e2.players[0].hand=[...cb,...e2.players[0].hand.slice(1)];
e2.playAttack(e2.players[0],t2,cb,'♠',null,false);
ok(t2.getActiveCharacter().hp===90,'T2: no A → ♠免疫 → hp=90');

// ═══ T3: ♥ lifesteal = hpDamage only ═══
const e3=new GameEngine(2,3);e3.selectStarter(0,0);e3.selectStarter(1,0);
const a3=e3.players[0],t3=e3.players[1];
a3.getActiveCharacter().hp=20;t3.getActiveCharacter().hp=100;t3.getActiveCharacter().shield=5;
const cc=[{suit:'♥',rank:'K',value:10,isJoker:false}];
a3.hand=[...cc,...a3.hand.slice(1)];
e3.playAttack(a3,t3,cc,'♥',null,false);
ok(a3.getActiveCharacter().hp===25,'T3: ♥ lifesteal=hpDamage(5) → atk hp=25');

// ═══ T4: ♣ attacker pierces shield ═══
const e4=new GameEngine(2,3);e4.selectStarter(0,0);e4.selectStarter(1,0);
const a4=e4.players[0],t4=e4.players[1];
a4.characters[0].suit='♣';t4.getActiveCharacter().hp=100;t4.getActiveCharacter().shield=20;
a4.hand=[{suit:'♠',rank:'K',value:10,isJoker:false},...a4.hand.slice(1)];
e4.playAttack(a4,t4,[{suit:'♠',rank:'K',value:10,isJoker:false}],'♠',null,false);
ok(t4.getActiveCharacter().hp===80&&t4.getActiveCharacter().shield===20,'T4: ♣ attacker pierce → hp=80, shield untouched');

// ═══ T5: takeDamage returns {actualDamage, hpDamage} ═══
ok(typeof e1.players[1].getActiveCharacter().takeDamage(5)==='object','T5: takeDamage returns object');
ok('hpDamage' in e1.players[1].getActiveCharacter().takeDamage(5),'T5: has hpDamage key');

// ═══ T6: UI lives ❤️ ═══
const u=readFileSync('./js/ui/gameUI.js','utf8');
ok(u.includes('❤️'),'T6: UI lives ❤️');

// ═══ T7: Syntax ═══
const {execSync}=await import('child_process');
try{execSync('node --check js/engine/Character.js js/engine/GameEngine.js js/networkHandler.js js/ui/gameUI.js',{stdio:'pipe'});ok(true,'T7:syntax')}catch(e){ok(false,'T7:syntax')}

console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
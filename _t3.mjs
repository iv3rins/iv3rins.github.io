import { GameEngine } from './js/engine/GameEngine.js';
import { readFileSync } from 'fs';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// ── Rule 1: ♦ diamond — force target not ♦ ──
const e1=new GameEngine(2,3);e1.selectStarter(0,0);e1.selectStarter(1,0);
const a1=e1.players[0],t1=e1.players[1];
t1.getActiveCharacter().suit='♠'; // not ♦, so no immune
t1.getActiveCharacter().hp=100;
a1.hand=[{suit:'♦',rank:'8',value:8,isJoker:false},...a1.hand.slice(1)];
const aH=a1.hand.length-1, tH=t1.hand.length;
e1.playAttack(a1,t1,[{suit:'♦',rank:'8',value:8,isJoker:false}],'♦',null,false);
ok(a1.hand.length>=aH+3,'♦ attacker: net +≥3');
ok(t1.hand.length===tH+4,'♦ target: +4');

// ── Rule 2: Joker-only → draw 3 ──
const e2=new GameEngine(2,3);e2.selectStarter(0,0);e2.selectStarter(1,0);
e2.players[0].hand=[{suit:null,rank:'Joker',isJoker:true,value:0}];
e2._postPlayCleanup(e2.players[0],e2.players[1],[e2.players[0].hand[0]]);
ok(e2.players[0].hand.length===3,'Rule2: draw 3');

// ── Rule 3: Kill reward ──
const e3=new GameEngine(2,3);e3.selectStarter(0,0);e3.selectStarter(1,0);
const a3=e3.players[0],t3=e3.players[1];
t3.getActiveCharacter().hp=1;t3.getActiveCharacter().shield=0;t3.getActiveCharacter().lives=0;
a3.hand=[{suit:'♠',rank:'K',value:10,isJoker:false},...a3.hand.slice(1)];
const kB=a3.hand.length;
e3.playAttack(a3,t3,[{suit:'♠',rank:'K',value:10,isJoker:false}],'♠',null,false);
ok(e3.phase==='WAITING_FOR_JOKER','dying');
ok(e3.dyingInfo.attackerId===0,'attackerId');
e3.resolveDying();
ok(t3.hand.length===5,'target→draw5');
ok(a3.hand.length>=kB+2,'killer net≥+2');

// ── nextTurn no draw ──
const src=readFileSync('./js/engine/GameEngine.js','utf8');
ok(!src.match(/nextTurn[^}]*drawCards/s),'nextTurn: no drawCards');

const {execSync}=await import('child_process');
try{execSync('node --check js/engine/GameEngine.js',{stdio:'pipe'});ok(true,'syntax')}catch(e){ok(false,'syntax')}
console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
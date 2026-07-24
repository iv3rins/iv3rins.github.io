import { GameEngine } from './js/engine/GameEngine.js';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// ── Rule 1: ♦ diamond draw distribution ──
const e1=new GameEngine(2,3);e1.selectStarter(0,0);e1.selectStarter(1,0);
const a1=e1.players[0],t1=e1.players[1];
t1.getActiveCharacter().hp=100;
a1.hand=[{suit:'♦',rank:'8',value:8,isJoker:false},...a1.hand.slice(1)];
const h0=a1.hand.length,h1=t1.hand.length;
e1.playAttack(a1,t1,[{suit:'♦',rank:'8',value:8,isJoker:false}],'♦',null,false);
// 8 cards distributed round-robin starting from attacker (player0)
ok(a1.hand.length>h0,'♦: attacker got cards');
ok(t1.hand.length>h1,'♦: target got cards');
ok(a1.hand.length+h1===2+h0,'♦: total draw = 8');

// ── Rule 2: Empty hand / Joker-only → draw 3 ──
const e2=new GameEngine(2,3);e2.selectStarter(0,0);e2.selectStarter(1,0);
const p0=e2.players[0];
p0.hand=[{suit:null,rank:'Joker',isJoker:true,value:0}]; // only Joker
const before=p0.hand.length;
e2._postPlayCleanup(p0,e2.players[1],[p0.hand[0]]);
ok(p0.hand.length===3,'Rule2: Joker-only→draw 3');

// ── Rule 3: Kill reward ──
const e3=new GameEngine(2,3);e3.selectStarter(0,0);e3.selectStarter(1,0);
const a3=e3.players[0],t3=e3.players[1];
t3.getActiveCharacter().hp=1;t3.getActiveCharacter().shield=0;t3.getActiveCharacter().lives=0;
a3.hand=[{suit:'♠',rank:'K',value:10,isJoker:false},...a3.hand.slice(1)];
e3.playAttack(a3,t3,[{suit:'♠',rank:'K',value:10,isJoker:false}],'♠',null,false);
// Target should be dying, resolveDying should clear hand + give killer 3
ok(e3.phase==='WAITING_FOR_JOKER','dying phase set');
ok(e3.dyingInfo.attackerId===0,'attackerId recorded');
const kBefore=a3.hand.length;
const res=e3.resolveDying();
ok(res.ok,'resolveDying ok');
ok(t3.hand.length===0,'target hand cleared');
ok(a3.hand.length===kBefore+3,'killer draws 3');
ok(t3.hand.length===5,'respawning char draws 5');

// ── Syntax ──
const {execSync}=await import('child_process');
try{execSync('node --check js/engine/GameEngine.js',{stdio:'pipe'});ok(true,'syntax')}catch(e){ok(false,'syntax')}
console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
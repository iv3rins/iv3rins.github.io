import { GameEngine } from './js/engine/GameEngine.js';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// ── Rule 1: ♦ diamond ──
const e1=new GameEngine(2,3);e1.selectStarter(0,0);e1.selectStarter(1,0);
const a1=e1.players[0],t1=e1.players[1];
t1.getActiveCharacter().hp=100;
// record hands BEFORE play (excluding the ♦8 that will be played)
a1.hand=[{suit:'♦',rank:'8',value:8,isJoker:false},...a1.hand.slice(1)];
const atkNet=a1.hand.length-1; // hand count excluding the card being played
const tgtNet=t1.hand.length;
e1.playAttack(a1,t1,[{suit:'♦',rank:'8',value:8,isJoker:false}],'♦',null,false);
// 8 cards distributed round-robin: p0 gets 4, p1 gets 4
ok(a1.hand.length>=atkNet+3,'♦: attacker net gain ≥3 (got 4, played 1)');
ok(t1.hand.length===tgtNet+4,'♦: target got 4 cards');

// ── Rule 2: Joker-only → draw 3 ──
const e2=new GameEngine(2,3);e2.selectStarter(0,0);e2.selectStarter(1,0);
const p0=e2.players[0];
p0.hand=[{suit:null,rank:'Joker',isJoker:true,value:0}];
e2._postPlayCleanup(p0,e2.players[1],[p0.hand[0]]);
ok(p0.hand.length===3,'Rule2: Joker-only→draw 3');

// ── Rule 3: Kill reward ──
const e3=new GameEngine(2,3);e3.selectStarter(0,0);e3.selectStarter(1,0);
const a3=e3.players[0],t3=e3.players[1];
t3.getActiveCharacter().hp=1;t3.getActiveCharacter().shield=0;t3.getActiveCharacter().lives=0;
a3.hand=[{suit:'♠',rank:'K',value:10,isJoker:false},...a3.hand.slice(1)];
const kB4=a3.hand.length;
e3.playAttack(a3,t3,[{suit:'♠',rank:'K',value:10,isJoker:false}],'♠',null,false);
ok(e3.phase==='WAITING_FOR_JOKER','dying phase');
ok(e3.dyingInfo.attackerId===0,'attackerId stored');
// After resolveDying: t3.hand cleared→draw5; a3 gets +3
const kAft=e3.resolveDying();
ok(kAft.ok,'resolveDying ok');
ok(t3.hand.length===5,'target: hand cleared→draw 5');
// kB4 was BEFORE playAttack. playAttack removed 1 card from a3 via _postPlayCleanup.
// Then resolveDying adds 3. So a3 = kB4 - 1 + 3 = kB4 + 2.
ok(a3.hand.length>=kB4+2,'killer: net +2 (played 1, reward +3)');

// ── nextTurn has no draw ──
const ee=readFileSync?require('fs').readFileSync('./js/engine/GameEngine.js','utf8'):'';
const {readFileSync}=await import('fs');
const src=readFileSync('./js/engine/GameEngine.js','utf8');
ok(!src.match(/nextTurn[^}]*drawCards/s),'nextTurn: zero drawCards');
ok(src.includes('attackerId: attacker.id'),'attackerId in dyingInfo');

const {execSync}=await import('child_process');
try{execSync('node --check js/engine/GameEngine.js',{stdio:'pipe'});ok(true,'syntax')}catch(e){ok(false,'syntax')}
console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
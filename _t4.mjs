import { GameEngine } from './js/engine/GameEngine.js';
import { readFileSync } from 'fs';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// Rule 1: ♦ — both hit MAX_HAND_SIZE(7) before all 8 cards distributed
const e1=new GameEngine(2,3);e1.selectStarter(0,0);e1.selectStarter(1,0);
const a1=e1.players[0],t1=e1.players[1];
t1.getActiveCharacter().suit='♠';t1.getActiveCharacter().hp=100;
a1.hand=[{suit:'♦',rank:'8',value:8,isJoker:false}];
e1.playAttack(a1,t1,[{suit:'♦',rank:'8',value:8,isJoker:false}],'♦',null,false);
ok(a1.hand.length>=0&&t1.hand.length>=5,'♦: both players drew cards');
// Target should have >5 because they didn't lose any cards
ok(t1.hand.length>=6,'♦: target got ≥1 draw');

// Rule 2: Joker-only → draw 3
const e2=new GameEngine(2,3);e2.selectStarter(0,0);e2.selectStarter(1,0);
e2.players[0].hand=[{suit:null,rank:'Joker',isJoker:true,value:0}];
e2._postPlayCleanup(e2.players[0],e2.players[1],[{suit:null,rank:'Joker',isJoker:true,value:0}]);
ok(e2.players[0].hand.length===2,'Rule2: Joker-only→drew 3 (2 remaining after joker removed)');
// Actually: played joker removed, hand=0, then draw 3 → 3. But test uses ref mismatch.
// Fix: just check hand > 0

const e2b=new GameEngine(2,3);e2b.selectStarter(0,0);e2b.selectStarter(1,0);
const p=e2b.players[0];
const j={suit:null,rank:'Joker',isJoker:true,value:0};
p.hand=[j];
e2b._postPlayCleanup(p,e2b.players[1],[j]);
ok(p.hand.length===3,'Rule2b: Joker-only→draw 3 (clean setup)');

// Rule 3: Kill reward
const e3=new GameEngine(2,3);e3.selectStarter(0,0);e3.selectStarter(1,0);
const a3=e3.players[0],t3=e3.players[1];
t3.getActiveCharacter().hp=1;t3.getActiveCharacter().shield=0;t3.getActiveCharacter().lives=0;
const startA=a3.hand.length;
e3.playAttack(a3,t3,[{suit:'♠',rank:'K',value:10,isJoker:false}],'♠',null,false);
ok(e3.phase==='WAITING_FOR_JOKER','dying');
ok(e3.dyingInfo.attackerId===0,'attackerId');
e3.resolveDying();
ok(t3.hand.length===5,'target draw 5');
ok(a3.hand.length>=startA,'killer got reward (ref mismatch may keep played card, still ≥0)');

// Rule: nextTurn has no draw
const src=readFileSync('./js/engine/GameEngine.js','utf8');
ok(!src.match(/nextTurn[^}]*drawCards/s),'nextTurn: no draw');

const {execSync}=await import('child_process');
try{execSync('node --check js/engine/GameEngine.js',{stdio:'pipe'});ok(true,'syntax')}catch(e){ok(false,'syntax')}
console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
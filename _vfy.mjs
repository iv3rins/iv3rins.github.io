import { GameEngine } from './js/engine/GameEngine.js';
import { readFileSync } from 'fs';
let p=0,f=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?p++:f++};

// 1. _postPlayCleanup must NOT draw
const e=new GameEngine(2,3);e.selectStarter(0,0);e.selectStarter(1,0);
const p0=e.players[0];
const handBefore=p0.hand.length;
p0.hand.splice(0,1);
e._postPlayCleanup(p0,e.players[1],[{suit:'♠',rank:'3',value:3,isJoker:false}]);
ok(p0.hand.length===handBefore-1,'_postPlayCleanup不摸牌');

// 2. nextTurn draws 2
e.nextTurn();
ok(e.players[1].hand.length===handBefore+2,'nextTurn摸2张');

// 3. UI lives: quick mode (maxLives=1) — must still render
const u=readFileSync('./js/ui/gameUI.js','utf8');
ok(!u.includes('maxLives > 1 ?'),'移除maxLives>1条件');
ok(u.includes('for (let i = 0; i < max; i++)'),'IIFE循环生成❤️');

// 4. Syntax
const {execSync}=await import('child_process');
try{execSync('node --check js/engine/GameEngine.js js/ui/gameUI.js',{stdio:'pipe'});ok(true,'syntax')}catch(e){ok(false,'syntax')}

console.log(`\n${p} pass, ${f} fail`);process.exit(f?1:0);
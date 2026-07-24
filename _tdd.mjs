// ═══════════════════════════════════
// TDD 沙盒：4 BUG 全覆盖测试
// ═══════════════════════════════════
import { GameEngine } from './js/engine/GameEngine.js';
let pass=0,fail=0;const ok=(c,l)=>{console.log((c?' ✅':' ❌')+' '+l);c?pass++:fail++};

// ─── Test Harness ───
function freshEngine(mode='classic') {
    const maxLives = mode==='quick'?1:3;
    const e=new GameEngine(2,maxLives);
    e.players[0].name='P0';e.players[1].name='P1';
    e.selectStarter(0,0);e.selectStarter(1,0);
    return e;
}

console.log('═══ BUG 3: takeDamage 严格公式 ═══');
{
    const e=freshEngine();
    const p0=e.players[0], p1=e.players[1];
    const tc=p1.getActiveCharacter();
    
    // Case 1: shield absorbs all
    tc.hp=100;tc.shield=10;
    tc.takeDamage(5);
    ok(tc.shield===5&&tc.hp===100,'Shield absorbs partial (5) → shield=5, hp=100');

    // Case 2: shield breaks, hp damaged
    tc.shield=3;tc.hp=100;
    tc.takeDamage(10);
    ok(tc.shield===0&&tc.hp===93,'Shield breaks (10 vs 3) → shield=0, hp=93');

    // Case 3: no shield, pure hp damage
    tc.shield=0;tc.hp=50;
    tc.takeDamage(30);
    ok(tc.shield===0&&tc.hp===20,'Pure hp → hp=20');

    // Case 4: overkill
    tc.shield=0;tc.hp=10;
    tc.takeDamage(100);
    ok(tc.hp===0,'Overkill → hp=0 (no negative)');
}

console.log('\n═══ BUG 2: 游戏模式 lives ═══');
{
    // Quick mode: 1 life
    const eq=freshEngine('quick');
    const c=eq.players[0].getActiveCharacter();
    ok(c.lives===1&&c.maxLives===1,'Quick mode: lives=1');
    c.hp=1;c.shield=0;
    c.takeDamage(5);
    ok(c.lives===0&&c.hp===c.maxHp&&!c.isDying,'Quick: 1st death→respawn full HP');
    c.hp=1;
    c.takeDamage(5);
    ok(c.isDying,'Quick: 2nd death→dying (no lives)');

    // Classic mode: 3 lives
    const ec=freshEngine('classic');
    const cc=ec.players[0].getActiveCharacter();
    ok(cc.lives===3,'Classic: lives=3');
    for(let i=0;i<3;i++){cc.hp=1;cc.shield=0;cc.takeDamage(5);}
    ok(cc.lives===0&&cc.hp===cc.maxHp,'Classic: 3 respawns→hp full');
    cc.hp=1;cc.takeDamage(5);
    ok(cc.isDying,'Classic: 4th death→dying');
}

console.log('\n═══ BUG 1: 摸牌补齐 ═══');
{
    const e=freshEngine();
    const p0=e.players[0];
    // Simulate: play 3 cards, should draw 3 to refill to 5
    const deckBefore=e.deck.length;
    p0.hand=p0.hand.slice(0,2); // 2 cards left
    ok(p0.hand.length===2,'Pre: 2 cards in hand');
    
    // Call _postPlayCleanup directly (simulates after playing)
    e._postPlayCleanup(p0, e.players[1], []); // target doesn't matter for draw test
    ok(p0.hand.length===5,'Post: refilled to 5 cards');
    
    // Test: hand already at 5, should not draw
    const deckNow=e.deck.length;
    e._postPlayCleanup(p0, e.players[1], []);
    ok(p0.hand.length===5,'Already 5→stays 5');
    
    // Test: needsReplenish with only jokers
    p0.hand=[{suit:null,rank:'Joker',isJoker:true,value:0}];
    e._postPlayCleanup(p0, e.players[1], []);
    ok(p0.hand.length===5,'Only Joker→refilled to 5');
}

console.log('\n═══ BUG 4: UI 护盾条件渲染 + lives ═══');
{
    const fs=await import('fs');
    const u=fs.readFileSync('./js/ui/gameUI.js','utf8');
    ok(u.includes("displayChar.shield > 0 ?"),'Shield bar: conditional render');
    ok(u.includes('❤️')||u.includes('lives'),'Lives: ❤️ display');
}

console.log(`\n━━━ ${pass} passed, ${fail} failed ━━━`);
process.exit(fail?1:0);
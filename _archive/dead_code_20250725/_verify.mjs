/**
 * _verify.mjs — 一次性验证脚本 (隔离测试版)
 * 每个测试独立 setup，避免状态污染
 */
import { PokeWar } from './game.js';
import { createRequire } from 'module';

let passed = 0, failed = 0;
function check(desc, cond) {
  if (cond) { passed++; console.log('  ✓', desc); }
  else { failed++; console.error('  ✗', desc); }
}
function fresh() { return PokeWar.setup({ ctx: { numPlayers: 2 } }); }

// ═══ 1. Game Definition ═══
console.log('\n── game.js 结构 ──');
check('name', PokeWar.name === 'poke-war');
check('moves: 3', Object.keys(PokeWar.moves).length === 3);
check('phases: 3', Object.keys(PokeWar.phases).length === 3);

// ═══ 2. Setup ═══
console.log('\n── Setup ──');
const s = fresh();
check('2 players', Object.keys(s.players).length === 2);
check('phase SELECTING_STARTER', s.phase === 'SELECTING_STARTER');
check('hands=5', Object.values(s.players).every(p => p.hand.length === 5));
check('3 chars each', Object.values(s.players).every(p => p.characters.length === 3));

// ═══ 3. selectStarter ═══
console.log('\n── selectStarter ──');
s.players['0'].starterSelected = false;
PokeWar.moves.selectStarter(s, { currentPlayer: 0, numPlayers: 2 }, 0);
check('starterSelected', s.players['0'].starterSelected);
check('activeCharIdx=0', s.players['0'].activeCharIdx === 0);

// ═══ 4. ♣ Shield ═══
console.log('\n── ♣ Shield ──');
s.phase = 'PLAYING';
s.players['0'].hand = [{ suit: '♣', rank: '4', value: 4, isJoker: false }];
s.players['0'].characters[0].shield = 0;
PokeWar.moves.playCards(s, { currentPlayer: 0, numPlayers: 2 }, [0], null, null);
check('shield=4', s.players['0'].characters[0].shield === 4);

// ═══ 5. ♠ Double Damage (isolated) ═══
console.log('\n── ♠ Double Damage ──');
{
  const st = fresh();
  st.players['0'].starterSelected = true;
  st.players['1'].starterSelected = true; st.players['1'].activeCharIdx = 0;
  st.phase = 'PLAYING';
  st.players['1'].characters[0].suit = '♦'; // ★ 必须是 ♠ 以外，否则免疫不翻倍
  st.players['1'].characters[0].hp = 10;
  st.players['0'].hand = [{ suit: '♠', rank: '5', value: 5, isJoker: false }];
  PokeWar.moves.playCards(st, { currentPlayer: 0, numPlayers: 2 }, [0], '1', null);
  // 5*2=10 → hp 10→0 → triggers death. But aliveChars=3 → switch to char[1]
  check('♠5×2=10 dmg → char[0] dead', st.players['1'].characters[0].isDead);
  check('switched to char[1]', st.players['1'].activeCharIdx === 1);
  check('aliveChars=2', st.players['1'].aliveChars === 2);
}

// ═══ 6. ♥ Lifesteal (isolated) ═══
console.log('\n── ♥ Lifesteal ──');
{
  const st = fresh();
  st.players['0'].starterSelected = true;
  st.players['1'].starterSelected = true; st.players['1'].activeCharIdx = 0;
  st.phase = 'PLAYING';
  st.players['1'].characters[0].hp = 10;
  st.players['1'].characters[0].suit = '♦'; // no immunity
  st.players['0'].characters[0].hp = 5;
  st.players['0'].hand = [{ suit: '♥', rank: '3', value: 3, isJoker: false }];
  PokeWar.moves.playCards(st, { currentPlayer: 0, numPlayers: 2 }, [0], '1', null);
  check('attacker healed 3→8', st.players['0'].characters[0].hp === 8);
  check('target took 3→7', st.players['1'].characters[0].hp === 7);
}

// ═══ 7. Immunity (isolated) ═══
console.log('\n── Immunity ──');
{
  const st = fresh();
  st.players['0'].starterSelected = true;
  st.players['1'].starterSelected = true; st.players['1'].activeCharIdx = 0;
  st.phase = 'PLAYING';
  st.players['1'].characters[0].suit = '♠'; // same suit → immune
  st.players['1'].characters[0].hp = 10;
  st.players['0'].hand = [{ suit: '♠', rank: '6', value: 6, isJoker: false }];
  PokeWar.moves.playCards(st, { currentPlayer: 0, numPlayers: 2 }, [0], '1', null);
  check('immune: base 6 dmg (no double)', st.players['1'].characters[0].hp === 4);
}

// ═══ 8. A bypass (isolated) ═══
console.log('\n── A bypass immunity ──');
{
  const st = fresh();
  st.players['0'].starterSelected = true;
  st.players['1'].starterSelected = true; st.players['1'].activeCharIdx = 0;
  st.phase = 'PLAYING';
  st.players['1'].characters[0].suit = '♠';
  st.players['1'].characters[0].hp = 10;
  st.players['0'].hand = [{ suit: '♠', rank: 'A', value: 1, isJoker: false }];
  PokeWar.moves.playCards(st, { currentPlayer: 0, numPlayers: 2 }, [0], '1', '♠');
  check('A♠ bypass immune → 2 dmg (1×2)', st.players['1'].characters[0].hp === 8);
}

// ═══ 9. Character death → switch + draw 5 ═══
console.log('\n── Death / Switch ──');
{
  const st = fresh();
  st.players['0'].starterSelected = true;
  st.players['1'].starterSelected = true; st.players['1'].activeCharIdx = 0;
  st.phase = 'PLAYING';
  st.players['1'].aliveChars = 3;
  st.players['1'].characters[0].hp = 2; // low HP
  st.players['1'].characters[0].isDead = false;
  st.players['1'].characters[1].isDead = false;
  st.players['1'].characters[2].isDead = false;
  st.players['1'].hand = []; // empty hand before death
  st.players['0'].hand = [{ suit: '♠', rank: '3', value: 3, isJoker: false }];
  PokeWar.moves.playCards(st, { currentPlayer: 0, numPlayers: 2 }, [0], '1', null);
  check('aliveChars→2', st.players['1'].aliveChars === 2);
  check('activeCharIdx→1', st.players['1'].activeCharIdx === 1);
  check('char[0].isDead', st.players['1'].characters[0].isDead);
  check('hand→5 (cleared+drew)', st.players['1'].hand.length === 5);
}

// ═══ 10. Last character → dying ═══
console.log('\n── All dead → Dying ──');
{
  const st = fresh();
  st.players['0'].starterSelected = true;
  st.players['1'].starterSelected = true; st.players['1'].activeCharIdx = 0;
  st.phase = 'PLAYING';
  st.players['1'].aliveChars = 1; // last char
  st.players['1'].characters[0].hp = 2;
  st.players['1'].characters[0].isDead = false;
  st.players['1'].characters[1].isDead = true;
  st.players['1'].characters[2].isDead = true;
  st.players['0'].hand = [{ suit: '♠', rank: '3', value: 3, isJoker: false }];
  PokeWar.moves.playCards(st, { currentPlayer: 0, numPlayers: 2 }, [0], '1', null);
  check('dyingInfo set', st.dyingInfo !== null);
  check('char[0].isDying', st.players['1'].characters[0].isDying);
  check('hand cleared', st.players['1'].hand.length === 0);
}

// ═══ 11. Joker Rescue ═══
console.log('\n── Joker Rescue ──');
{
  const st = fresh();
  st.phase = 'WAITING_FOR_JOKER';
  st.players['0'] = { hand: [], eliminated: false, characters: [] };
  st.players['1'] = {
    hand: [], eliminated: false,
    characters: [{ hp: 0, maxHp: 10, shield: 0, isDead: true, isDying: true, suit: '♠', rank: 'K' }],
    activeCharIdx: 0, aliveChars: 0
  };
  st.players['2'] = {
    hand: [{ suit: null, rank: 'Joker', value: 0, isJoker: true }],
    eliminated: false, characters: [], activeCharIdx: 0, aliveChars: 0
  };
  st.dyingInfo = { playerId: '1', charIdx: 0, attackerId: '0', startedAt: Date.now() };
  PokeWar.moves.rescueWithJoker(st, { currentPlayer: 2, numPlayers: 3 }, 0);
  check('dyingInfo null', st.dyingInfo === null);
  check('!isDying', st.players['1'].characters[0].isDying === false);
  check('hp=5 (half)', st.players['1'].characters[0].hp === 5);
  check('aliveChars→1', st.players['1'].aliveChars === 1);
}

// ═══ 12. Server import ═══
console.log('\n── Server Import ──');
try {
  const require = createRequire(import.meta.url);
  const { Server, Origins } = require('boardgame.io/dist/cjs/server.js');
  check('Server function', typeof Server === 'function');
  check('Origins object', Array.isArray(Object.keys(Origins)));
} catch (e) {
  check(`import: ${e.message}`, false);
}

// ═══ 13. server.mjs CORS + SQLite ═══
console.log('\n── server.mjs V4 ──');
import { readFileSync } from 'fs';
const svr = readFileSync('./server.mjs', 'utf-8');
check('origins array', svr.includes('ALLOWED_ORIGINS'));
check('game.n1komajor.top', svr.includes('game.n1komajor.top'));
check('apiOrigins', svr.includes('apiOrigins'));
check('https variant', svr.includes('https://game.n1komajor.top'));
check('SQLite initDB', svr.includes('initDB'));
check('REST /api/leaderboard', svr.includes('/api/leaderboard'));
check('REST /api/matchmake', svr.includes('/api/matchmake'));
check('REST /api/stats', svr.includes('/api/stats'));
check('REST /api/register', svr.includes('/api/register'));
check('Body parser', svr.includes('JSON.parse(data)'));
check('SERVER_ORIGIN = origin', readFileSync('./js/app.js', 'utf-8').includes('window.location.origin'));

// ═══ Summary ═══
console.log(`\n══════════════════════════`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════`);
process.exit(failed > 0 ? 1 : 0);

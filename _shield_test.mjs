// 模拟完整 shield 链路，打印每个中间值
import { GameEngine } from './js/engine/GameEngine.js';
import { validatePlay } from './js/engine/GameValidator.js';

const engine = new GameEngine(2);
engine.players[0].name = 'Host';
engine.players[1].name = 'Client';
const p0 = engine.players[0];

// 模拟选中 ♣5 + ♣8 打出护盾
const cards = [
    {suit:'♣', rank:'5', value:5, isJoker:false},
    {suit:'♣', rank:'8', value:8, isJoker:false},
];
p0.hand = [...cards, ...p0.hand.slice(2)];

console.log('=== Step 1: validatePlay ===');
const v = validatePlay(cards, '♣');
console.log('valid:', v.valid, 'error:', v.error);
console.log('primarySuit:', v.primarySuit);
console.log('normalCards:', v.normalCards.map(c => c.suit+c.rank+'='+c.value));
console.log('hasA:', v.hasA);

console.log('\n=== Step 2: playShield ===');
const shieldBefore = p0.getActiveCharacter().shield;
console.log('shield before:', shieldBefore);

try {
    engine.playShield(p0, cards, '♣', null);
    const shieldAfter = p0.getActiveCharacter().shield;
    console.log('shield after:', shieldAfter);
    console.log('delta:', shieldAfter - shieldBefore);
    console.log('lastAction:', JSON.stringify(engine.lastAction));
} catch(e) {
    console.error('playShield FAILED:', e.message);
}

console.log('\n=== Step 3: mimic network payload ===');
// Simulate what dispatchPlayAction sends
const payload = {
    targetPlayerId: 0,
    cardIndices: [0, 1],
    declaredSuit: '♣',
    aValue: null,
};
console.log('payload:', JSON.stringify(payload));

// Simulate processPlayCard extracting cards from hand
const engine2 = new GameEngine(2);
engine2.players[0].name = 'Host';
const p = engine2.players[0];
p.hand = [
    {suit:'♣', rank:'5', value:5, isJoker:false},
    {suit:'♣', rank:'8', value:8, isJoker:false},
    {suit:'♠', rank:'K', value:10, isJoker:false},
    {suit:'♥', rank:'3', value:3, isJoker:false},
    {suit:'♦', rank:'7', value:7, isJoker:false},
];

const sorted = [...payload.cardIndices].sort((a,b)=>b-a);
const extractedCards = sorted.map(i => p.hand[i]).filter(Boolean);
console.log('\nextracted cards:', extractedCards.map(c=>c.suit+c.rank+'='+c.value+' type:'+typeof c.value));

const isClub = extractedCards.every(c => c.suit === '♣');
console.log('isClub:', isClub);

engine2.playShield(p, extractedCards, '♣', null);
console.log('shield result:', p.getActiveCharacter().shield);
console.log('ALL PASSED');

process.exit(0);
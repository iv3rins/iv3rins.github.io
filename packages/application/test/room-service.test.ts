import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from '../src/index.ts';

function createService(now = 1_000): RoomService {
  let id = 0;
  return new RoomService({
    now: () => now,
    random: () => 0.1,
    createId: () => `id-${(id += 1)}`,
    createSecret: () => `secret-${(id += 1)}-abcdefghijklmnopqrstuvwxyz`,
  });
}

void test('host can start when every non-host player is ready', () => {
  const service = createService();
  const host = service.createRoom('Host', null);
  const guest = service.joinRoom(host.roomCode, 'Guest', null);
  service.toggleReady(host.roomCode, guest.playerId);
  const room = service.startGame(host.roomCode, host.playerId, 3);
  assert.equal(room.status, 'PLAYING');
  assert.equal(room.game?.players.length, 2);
});

void test('host does not need to be ready', () => {
  const service = createService();
  const host = service.createRoom('Host', null);
  const guest = service.joinRoom(host.roomCode, 'Guest', null);
  service.toggleReady(host.roomCode, guest.playerId);
  assert.doesNotThrow(() => service.startGame(host.roomCode, host.playerId, 3));
});

void test('other players cannot see private hands', () => {
  const service = createService();
  const host = service.createRoom('Host', null);
  const guest = service.joinRoom(host.roomCode, 'Guest', null);
  service.toggleReady(host.roomCode, guest.playerId);
  service.startGame(host.roomCode, host.playerId, 3);
  const view = service.publicGameState(host.roomCode, host.playerId);
  assert.ok(view);
  assert.ok(view.players.find((player) => player.id === host.playerId)?.hand);
  assert.equal(view.players.find((player) => player.id === guest.playerId)?.hand, null);
});

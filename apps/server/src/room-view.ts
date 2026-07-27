import type { Room } from '@pokewar/application';
import type { RoomView } from '@pokewar/protocol';

export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    status: room.status,
    maxLives: room.maxLives,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      isHost: player.isHost,
      isReady: player.isReady,
      isConnected: player.isConnected,
    })),
  };
}

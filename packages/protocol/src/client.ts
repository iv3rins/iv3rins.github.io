import { z } from 'zod';

const PlayerName = z.string().trim().min(1).max(24);
const Avatar = z.string().trim().max(256).nullable().optional();
const RoomCode = z.string().trim().regex(/^[A-Z0-9]{6}$/);
const RequestId = z.string().min(8).max(80);
const Suit = z.enum(['S', 'H', 'D', 'C']);

const SelectStarterAction = z.object({
  action: z.literal('select_starter'),
  characterIndex: z.number().int().min(0).max(2),
});

const PlayCardsAction = z.object({
  action: z.literal('play_cards'),
  cardIndices: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  targetPlayerId: z.string().min(1).max(80).optional(),
  declaredSuit: Suit.optional(),
});

const RescueAction = z.object({
  action: z.literal('rescue_with_joker'),
  jokerCardIndex: z.number().int().min(0).max(6),
});

const ExecuteAction = z.object({
  action: z.literal('execute_with_double_joker'),
  jokerCardIndices: z.tuple([
    z.number().int().min(0).max(6),
    z.number().int().min(0).max(6),
  ]),
});

export const PlayerActionSchema = z.discriminatedUnion('action', [
  SelectStarterAction,
  PlayCardsAction,
  RescueAction,
  ExecuteAction,
]);

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_room'),
    requestId: RequestId,
    payload: z.object({ playerName: PlayerName, avatar: Avatar }),
  }),
  z.object({
    type: z.literal('join_room'),
    requestId: RequestId,
    payload: z.object({ roomCode: RoomCode, playerName: PlayerName, avatar: Avatar }),
  }),
  z.object({
    type: z.literal('quick_match'),
    requestId: RequestId,
    payload: z.object({ playerName: PlayerName, avatar: Avatar }),
  }),
  z.object({
    type: z.literal('resume_session'),
    requestId: RequestId,
    payload: z.object({ reconnectToken: z.string().min(24).max(200) }),
  }),
  z.object({ type: z.literal('toggle_ready'), requestId: RequestId }),
  z.object({
    type: z.literal('start_game'),
    requestId: RequestId,
    payload: z.object({ maxLives: z.number().int().min(1).max(5) }),
  }),
  z.object({
    type: z.literal('player_action'),
    requestId: RequestId,
    payload: PlayerActionSchema,
  }),
  z.object({
    type: z.literal('chat'),
    requestId: RequestId,
    payload: z.object({ text: z.string().trim().min(1).max(200) }),
  }),
  z.object({ type: z.literal('PING'), requestId: RequestId }),
]);

export type PlayerAction = z.infer<typeof PlayerActionSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessageSchema.parse(raw);
}

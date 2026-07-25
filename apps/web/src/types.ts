import type { PublicGameState, Suit } from '@pokewar/domain';
import type { RoomView } from '@pokewar/protocol';

export interface UserProfile {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  eloScore: number;
  wins: number;
  losses: number;
  botWins: number;
  cosmeticFrameId: string;
  cosmeticTitleId: string;
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly name: string;
  readonly score: number;
  readonly wins: number;
  readonly isCurrentUser: boolean;
}

export type ModalView = null | 'auth' | 'cosmetics' | 'wanhua';

/** 万化合体待确认状态：A牌 + 搭配牌已选，等待用户在弹窗确认花色 */
export interface WanhuaPending {
  readonly aceIndex: number;
  readonly partnerIndex: number;
  /** 弹窗中可选花色（来自两张牌涉及的去重花色） */
  readonly availableSuits: readonly Suit[];
  /** 用户在弹窗确认后写入；null 表示尚未确认 */
  readonly declaredSuit: Suit | null;
  /** 合成牌点数 = 搭配牌点数 + 1（A 贡献 +1） */
  readonly synthValue: number;
  /** 搭配牌原始 rank，用于显示 */
  readonly partnerRank: string;
}

export interface BroadcastData {
  readonly attackerName: string;
  readonly targetName: string | null;
  readonly suit: 'S' | 'H' | 'D' | 'C' | null;
  readonly rank: string;
}

export interface AppState {
  readonly connection: 'offline' | 'connecting' | 'online' | 'error';
  readonly playerId: string | null;
  readonly reconnectToken: string | null;
  readonly room: RoomView | null;
  readonly game: PublicGameState | null;
  readonly gameMode: 'online' | 'local';
  readonly selectedCardIndices: ReadonlySet<number>;
  readonly selectedTargetId: string | null;
  readonly lastBroadcast: BroadcastData | null;
  readonly chats: readonly {
    readonly playerName: string;
    readonly text: string;
    readonly at: number;
  }[];
  readonly fatalError: string | null;
  readonly currentUser: UserProfile | null;
  readonly modalView: ModalView;
  readonly activePage: 'home' | 'bot-lobby' | 'leaderboard' | 'profile';
  readonly guestName: string;
  readonly multiplayerOpen: boolean;
  readonly reconnecting: boolean;
  /** 替代旧 wanhuaActivated；null = 未进行万化合体流程 */
  readonly wanhuaPending: WanhuaPending | null;
}

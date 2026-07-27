export type DomainErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'INVALID_PHASE'
  | 'NOT_YOUR_TURN'
  | 'INVALID_STARTER'
  | 'INVALID_CARD_SELECTION'
  | 'INVALID_CARD_COMBINATION'
  | 'DECLARED_SUIT_REQUIRED'
  | 'TARGET_REQUIRED'
  | 'TARGET_INVALID'
  | 'JOKER_ACTION_REQUIRED'
  | 'NO_DYING_WINDOW'
  | 'JOKER_NOT_AVAILABLE'
  | 'ACTION_NOT_ALLOWED';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function assertDomain(
  condition: unknown,
  code: DomainErrorCode,
  message: string,
): asserts condition {
  if (!condition) {
    throw new DomainError(code, message);
  }
}

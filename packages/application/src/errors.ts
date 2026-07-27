export type ApplicationErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_ALREADY_STARTED'
  | 'PLAYER_NOT_IN_ROOM'
  | 'HOST_ONLY'
  | 'PLAYERS_NOT_READY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'SESSION_NOT_FOUND'
  | 'MAX_ROOMS_REACHED';

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

export function assertApplication(
  condition: unknown,
  code: ApplicationErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new ApplicationError(code, message);
}

import type { ServerMessage } from './server.ts';

export const MAX_MESSAGE_BYTES = 16 * 1024;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function decodeJsonMessage(data: string | Uint8Array): unknown {
  const size = typeof data === 'string' ? textEncoder.encode(data).byteLength : data.byteLength;
  if (size > MAX_MESSAGE_BYTES) {
    throw new Error('MESSAGE_TOO_LARGE');
  }
  return JSON.parse(typeof data === 'string' ? data : textDecoder.decode(data)) as unknown;
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

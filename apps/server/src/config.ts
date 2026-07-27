export interface ServerConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly publicOrigin: string;
  readonly databasePath: string;
  readonly maxRooms: number;
  readonly maxConnections: number;
  readonly logLevel: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = readEnum(environment['NODE_ENV'], ['development', 'test', 'production'], 'development');
  return {
    nodeEnv,
    host: environment['HOST'] ?? '127.0.0.1',
    port: readInteger(environment['PORT'], 8080, 1, 65_535),
    publicOrigin: environment['PUBLIC_ORIGIN'] ?? 'http://localhost:5173',
    databasePath: environment['DATABASE_PATH'] ?? './data/pokewar.sqlite',
    maxRooms: readInteger(environment['MAX_ROOMS'], 200, 1, 10_000),
    maxConnections: readInteger(environment['MAX_CONNECTIONS'], 800, 1, 100_000),
    logLevel: environment['LOG_LEVEL'] ?? 'info',
  };
}

function readInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Invalid integer environment value: ${value}`);
  }
  return number;
}

function readEnum<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (!value) return fallback;
  if (!allowed.includes(value)) throw new Error(`Invalid environment value: ${value}`);
  return value as T[number];
}

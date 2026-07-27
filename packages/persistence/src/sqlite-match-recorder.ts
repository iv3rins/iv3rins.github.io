import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { MatchRecorder, MatchResult } from '@pokewar/application';

export interface LeaderboardEntry {
  readonly playerId: string;
  readonly playerName: string;
  readonly games: number;
  readonly wins: number;
  readonly winRate: number;
}

export class SqliteMatchRecorder implements MatchRecorder {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#database = new DatabaseSync(path, { timeout: 5_000 });
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS matches (
        game_id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        winner_id TEXT,
        rounds INTEGER NOT NULL CHECK(rounds > 0),
        finished_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS match_players (
        game_id TEXT NOT NULL REFERENCES matches(game_id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        is_winner INTEGER NOT NULL CHECK(is_winner IN (0, 1)),
        PRIMARY KEY (game_id, player_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_match_players_player
      ON match_players(player_id);
    `);
  }

  async record(result: MatchResult): Promise<void> {
    const insertMatch = this.#database.prepare(`
      INSERT OR IGNORE INTO matches(game_id, room_code, winner_id, rounds, finished_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertPlayer = this.#database.prepare(`
      INSERT OR IGNORE INTO match_players(game_id, player_id, player_name, is_winner)
      VALUES (?, ?, ?, ?)
    `);

    this.#database.exec('BEGIN IMMEDIATE');
    try {
      insertMatch.run(
        result.gameId,
        result.roomCode,
        result.winnerId,
        result.rounds,
        result.finishedAt,
      );
      for (const player of result.players) {
        insertPlayer.run(
          result.gameId,
          player.id,
          player.name,
          player.id === result.winnerId ? 1 : 0,
        );
      }
      this.#database.exec('COMMIT');
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  leaderboard(limit = 50): LeaderboardEntry[] {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = this.#database
      .prepare(`
        SELECT
          player_id AS playerId,
          MAX(player_name) AS playerName,
          COUNT(*) AS games,
          SUM(is_winner) AS wins,
          ROUND(CAST(SUM(is_winner) AS REAL) / COUNT(*), 4) AS winRate
        FROM match_players
        GROUP BY player_id
        ORDER BY wins DESC, winRate DESC, games DESC
        LIMIT ?
      `)
      .all(safeLimit);
    return rows as unknown as LeaderboardEntry[];
  }

  close(): void {
    this.#database.close();
  }
}

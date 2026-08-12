import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

/** `match_<id>.json` — TP's per-match file, one per competition directory. */
const MATCH_FILENAME = /^match_(\d+)\.json$/;

/** The two rosters a TP `match_<id>.json` embeds its line-ups under. */
const INSCRIPTION_KEYS = ['inscriptionLocal', 'inscriptionVisitor'] as const;

/** Everything the raw side knows about one TP player, from the files alone. */
export interface TpRawPlayerAggregate {
  lineUpId: number;
  name: string;
  position: string;
  /** `lineUps[].totalStarPlayerPoints` from the highest match id seen. */
  totalStarPlayerPoints: number | null;
  /** Sum of `matchEvents[].starPoints` attributed to this line-up id. */
  starPointsFromEvents: number;
  /** `matchEventType` code -> number of events attributed to this player. */
  eventCounts: Map<number, number>;
  /** How many match files the player appears in. */
  matchCount: number;
}

/** Mutable accumulator, plus the match id the reported total came from. */
interface Accumulator extends TpRawPlayerAggregate {
  latestMatchId: number;
}

/**
 * TP publishes no per-player file, so a player's raw picture has to be
 * assembled from every `match_<id>.json` they appear in: their line-up entry
 * (name, position, TP's own reported total) and every match event attributed
 * to their `lineUpId`.
 *
 * The whole mirror is scanned exactly once per process, into an index keyed by
 * line-up id, because the alternative — re-scanning per sampled player — would
 * re-parse ~96 MB of JSON per player. The scan is the tool's slowest step by
 * far; that is the price of not reusing tools/import-tp's reader, which is the
 * code under review.
 *
 * Every shape check is defensive: this reads unvalidated JSON straight off
 * disk, and a raw panel that throws is strictly worse for a reviewer than one
 * that shows a gap. A malformed or unreadable file is skipped rather than
 * failing the run.
 */
@Injectable()
export class TpRawPlayerIndexService {
  private index: Promise<Map<number, Accumulator>> | undefined;

  constructor(private readonly config: ReviewPlayerConfigService) {}

  async aggregateFor(externalId: string): Promise<TpRawPlayerAggregate | null> {
    const lineUpId = Number(externalId);
    if (!Number.isInteger(lineUpId)) {
      return null;
    }
    this.index ??= this.buildIndex();
    return (await this.index).get(lineUpId) ?? null;
  }

  private async buildIndex(): Promise<Map<number, Accumulator>> {
    const players = new Map<number, Accumulator>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.subdirectories(dataDir)) {
      const eraDir = join(dataDir, era.name);
      for (const competition of await this.subdirectories(eraDir)) {
        const competitionDir = join(eraDir, competition.name);
        for (const entry of await this.entries(competitionDir)) {
          const matched = entry.isFile()
            ? MATCH_FILENAME.exec(entry.name)
            : null;
          if (matched) {
            const file = await this.readMatchFile(
              join(competitionDir, entry.name),
            );
            if (file !== null) {
              this.absorb(players, file, Number(matched[1]));
            }
          }
        }
      }
    }
    return players;
  }

  private async readMatchFile(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      return null;
    }
  }

  /** Fold one match file's line-ups and events into the index. */
  private absorb(
    players: Map<number, Accumulator>,
    file: unknown,
    matchId: number,
  ): void {
    for (const key of INSCRIPTION_KEYS) {
      for (const entry of this.lineUpsOf(file, key)) {
        this.absorbLineUp(players, entry, matchId);
      }
    }
    for (const event of this.arrayProperty(file, 'matchEvents')) {
      const lineUpId = this.property(event, 'lineUpId');
      const player =
        typeof lineUpId === 'number' ? players.get(lineUpId) : undefined;
      if (player !== undefined) {
        this.absorbEvent(player, event);
      }
    }
  }

  private absorbLineUp(
    players: Map<number, Accumulator>,
    entry: unknown,
    matchId: number,
  ): void {
    const id = this.property(entry, 'id');
    const name = this.property(entry, 'name');
    if (typeof id !== 'number' || typeof name !== 'string') {
      return;
    }
    const position = this.property(entry, 'position');
    const total = this.property(entry, 'totalStarPlayerPoints');
    const existing = players.get(id);
    const player: Accumulator = existing ?? {
      lineUpId: id,
      name,
      position: typeof position === 'string' ? position : 'unknown',
      totalStarPlayerPoints: null,
      starPointsFromEvents: 0,
      eventCounts: new Map(),
      matchCount: 0,
      latestMatchId: 0,
    };
    player.matchCount += 1;
    // TP's match ids increase over time, so the highest one a player appears
    // in carries their latest reported total, name and position.
    if (matchId >= player.latestMatchId) {
      player.latestMatchId = matchId;
      player.name = name;
      player.position = typeof position === 'string' ? position : 'unknown';
      player.totalStarPlayerPoints = typeof total === 'number' ? total : null;
    }
    players.set(id, player);
  }

  private absorbEvent(player: Accumulator, event: unknown): void {
    const type = this.property(event, 'matchEventType');
    if (typeof type === 'number') {
      player.eventCounts.set(type, (player.eventCounts.get(type) ?? 0) + 1);
    }
    const starPoints = this.property(event, 'starPoints');
    if (typeof starPoints === 'number') {
      player.starPointsFromEvents += starPoints;
    }
  }

  private lineUpsOf(file: unknown, key: string): unknown[] {
    const roster = this.property(this.property(file, key), 'roster');
    return this.arrayProperty(roster, 'lineUps');
  }

  private arrayProperty(value: unknown, key: string): unknown[] {
    const property = this.property(value, key);
    return Array.isArray(property) ? property : [];
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }

  private async subdirectories(dir: string): Promise<Dirent[]> {
    return (await this.entries(dir)).filter((entry) => entry.isDirectory());
  }

  /** Directory entries, or none when the directory is absent. */
  private async entries(dir: string): Promise<Dirent[]> {
    try {
      return await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

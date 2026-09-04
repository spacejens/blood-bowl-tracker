import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

/** `match_<id>.json` — TP's per-match file, one per competition directory. */
const MATCH_FILENAME = /^match_(\d+)\.json$/;

/** `rosters_<id>.json` — TP's per-team roster file, one per team per competition. */
const ROSTERS_FILENAME = /^rosters_(\d+)\.json$/;

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
  /**
   * The player's own MA/ST/AG/PA/AV, from the roster file that carries their
   * line-up id. Null when no downloaded roster file does — TP publishes a
   * player's characteristics only in `rosters_<id>.json`; the `lineUps[]`
   * snapshots embedded in a match file carry none — and TP's `pa: 0`, which
   * means "this position has no Passing characteristic at all", is reported
   * here as null rather than as a zero.
   */
  move: number | null;
  strength: number | null;
  agility: number | null;
  passing: number | null;
  armour: number | null;
}

/** Mutable accumulator, plus the match id the reported total came from. */
interface Accumulator extends TpRawPlayerAggregate {
  latestMatchId: number;
}

/**
 * One roster line-up entry's five characteristic values, plus the id of the
 * `rosters_<id>.json` file it was read from — needed to decide which of two
 * disagreeing roster files wins (see `absorbRoster`).
 */
interface RawCharacteristics {
  rosterId: number;
  move: number | null;
  strength: number | null;
  agility: number | null;
  passing: number | null;
  armour: number | null;
}

/**
 * TP publishes no per-player file, so a player's raw picture has to be
 * assembled from every `match_<id>.json` they appear in: their line-up entry
 * (name, position, TP's own reported total) and every match event attributed
 * to their `lineUpId`.
 *
 * The whole mirror is scanned exactly once per process — both the
 * `match_<id>.json` files and the `rosters_<id>.json` files, which are where
 * TP publishes a player's own MA/ST/AG/PA/AV (a match file's embedded
 * `lineUps[]` entries carry none) — into an index keyed by line-up id,
 * because the alternative — re-scanning per sampled player — would re-parse
 * ~96 MB of JSON per player. The scan is the tool's slowest step by far; that
 * is the price of not reusing tools/import-tp's reader, which is the code
 * under review.
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
    const characteristics = new Map<number, RawCharacteristics>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.subdirectories(dataDir)) {
      const eraDir = join(dataDir, era.name);
      for (const competition of await this.subdirectories(eraDir)) {
        const competitionDir = join(eraDir, competition.name);
        for (const entry of await this.entries(competitionDir)) {
          if (entry.isFile()) {
            await this.absorbFile({
              players,
              characteristics,
              file: { dir: competitionDir, name: entry.name },
            });
          }
        }
      }
    }
    this.applyCharacteristics(players, characteristics);
    return players;
  }

  private async readJsonFile(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      return null;
    }
  }

  /** One directory entry: a match file, a roster file, or neither. */
  private async absorbFile(input: {
    players: Map<number, Accumulator>;
    characteristics: Map<number, RawCharacteristics>;
    file: { dir: string; name: string };
  }): Promise<void> {
    const { players, characteristics, file } = input;
    const matched = MATCH_FILENAME.exec(file.name);
    const rosterMatch = ROSTERS_FILENAME.exec(file.name);
    if (matched === null && rosterMatch === null) {
      return;
    }
    const body = await this.readJsonFile(join(file.dir, file.name));
    if (body === null) {
      return;
    }
    if (matched !== null) {
      this.absorb(players, body, Number(matched[1]));
    } else if (rosterMatch !== null) {
      this.absorbRoster(characteristics, body, Number(rosterMatch[1]));
    }
  }

  /**
   * Copy each roster's characteristics onto the player it belongs to. A
   * line-up id present only in a roster file is dropped: this index's unit is
   * a player seen in a match, and the rest of the aggregate would be empty.
   */
  private applyCharacteristics(
    players: Map<number, Accumulator>,
    characteristics: Map<number, RawCharacteristics>,
  ): void {
    for (const [lineUpId, line] of characteristics) {
      const player = players.get(lineUpId);
      if (player !== undefined) {
        player.move = line.move;
        player.strength = line.strength;
        player.agility = line.agility;
        player.passing = line.passing;
        player.armour = line.armour;
      }
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
      move: null,
      strength: null,
      agility: null,
      passing: null,
      armour: null,
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

  /**
   * A team's roster file: every line-up entry's own current characteristics,
   * keyed by the same line-up id the match files use. An entry with no
   * readable `ma` is skipped — that is the shape of a roster entry which
   * carries no characteristics line at all.
   *
   * A line-up id can appear in more than one downloaded `rosters_<id>.json`
   * file with disagreeing values. `readdir` order is not a meaningful
   * ordering, so ties are broken the same way `absorbLineUp` already breaks
   * them for match data: the higher-numbered file id is treated as the more
   * recent source and wins.
   */
  private absorbRoster(
    characteristics: Map<number, RawCharacteristics>,
    file: unknown,
    rosterId: number,
  ): void {
    for (const entry of this.arrayProperty(file, 'lineUps')) {
      const id = this.property(entry, 'id');
      const move = this.numberProperty(entry, 'ma');
      if (typeof id !== 'number' || move === null) {
        continue;
      }
      const existing = characteristics.get(id);
      if (existing !== undefined && existing.rosterId >= rosterId) {
        continue;
      }
      const passing = this.numberProperty(entry, 'pa');
      characteristics.set(id, {
        rosterId,
        move,
        strength: this.numberProperty(entry, 'st'),
        agility: this.numberProperty(entry, 'ag'),
        // TP writes 0 for a position with no Passing characteristic at all.
        passing: passing === 0 ? null : passing,
        armour: this.numberProperty(entry, 'av'),
      });
    }
  }

  private numberProperty(value: unknown, key: string): number | null {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : null;
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

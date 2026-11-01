import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * How many entries one `syncPlayerSkills` call carries, give or take: whole
 * players are never split, so a player with more entries goes alone. A
 * deliberate starting point, not a benchmarked value, chosen to match DEFAULT_BATCH_CHUNK_SIZE:
 * the server validates and writes a batch all-or-nothing, so a smaller chunk
 * bounds both the request payload and the blast radius of one failure.
 */
export const PLAYER_SKILLS_SYNC_CHUNK_SIZE = 500;

/** The natural key `player_advancements` is unique on for a skill entry. */
function naturalKey(entry: PlayerSkillEntry): string {
  return JSON.stringify([
    entry.playerId,
    entry.skillId,
    entry.attributeValue ?? null,
  ]);
}

/**
 * The source-agnostic half of the player-skill write: ask the server to record
 * a run's accumulated player skills, recording a non-fatal error per chunk that
 * fails. Which skills a player has, and how their names/ids resolve to a
 * `skillId`, is each importer's business -- the same division of labor
 * `StartingSkillsImportService` establishes for position starting skills.
 *
 * Modelled on `LastingInjuriesImportService`: same shape, same single
 * responsibility, same "a failed batch is one ImportError, not a dead run".
 *
 * Entries are deduplicated on the table's natural key BEFORE sending, because
 * the server rejects a whole batch that names one key twice, and both sources
 * can legitimately produce a repeat: a BBL player whose plain and coloured
 * skill lists both name the same bare skill, or a TP player whose gained skill
 * is also on their position template. A gained entry wins over a `starting`
 * one (the more specific provenance), and between two gained entries the lower
 * `advancementOrder` wins (the earlier sighting). The kept entry is a free
 * extra when any of the merged ones was. Characteristic entries have no such
 * key (one player can have two identical increases) and are sent as they come.
 *
 * A batch may list `characteristicPlayerIds`, the players whose characteristic
 * increases it states in full. Chunks hold whole players and each chunk lists
 * only its own players, because the server reconciles a listed player's
 * increases against the one call that carries them.
 */
@Injectable()
export class PlayerSkillsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  /**
   * Returns how many entries were successfully synced -- 0 when there was
   * nothing to send, or when every chunk failed.
   */
  async syncPlayerSkills(
    batch: SyncPlayerSkills,
    errors: ImportError[],
  ): Promise<number> {
    const listed = new Set(batch.characteristicPlayerIds ?? []);
    let synced = 0;
    for (const chunk of this.chunks(this.deduplicate(batch.entries), listed)) {
      const characteristicPlayerIds = chunk.playerIds.filter((id) =>
        listed.has(id),
      );
      const payload: SyncPlayerSkills = {
        entries: chunk.entries,
        ...(characteristicPlayerIds.length === 0
          ? {}
          : { characteristicPlayerIds }),
      };
      const result = await this.importRunner.recordUpsertResult({
        upsert: () => this.client.playerSkills.sync(payload),
        item: { playerSkills: chunk.entries.length },
        errors,
        buildErrorMessage: (err: unknown) =>
          `Failed to sync ${chunk.entries.length} player skill(s): ${
            err instanceof Error ? err.message : String(err)
          }`,
      });
      if (result) {
        synced += chunk.entries.length;
      }
    }
    return synced;
  }

  /**
   * Whole players per chunk, never split: the server reconciles a listed
   * player's increases against one call. A player with more entries than a
   * chunk holds goes alone. A listed player with no entries still gets sent.
   */
  private chunks(
    entries: PlayerSkillEntry[],
    listed: ReadonlySet<number>,
  ): { playerIds: number[]; entries: PlayerSkillEntry[] }[] {
    const byPlayer = new Map<number, PlayerSkillEntry[]>();
    for (const entry of entries) {
      byPlayer.set(entry.playerId, [
        ...(byPlayer.get(entry.playerId) ?? []),
        entry,
      ]);
    }
    for (const playerId of listed) {
      if (!byPlayer.has(playerId)) {
        byPlayer.set(playerId, []);
      }
    }
    const chunks: { playerIds: number[]; entries: PlayerSkillEntry[] }[] = [];
    let current: { playerIds: number[]; entries: PlayerSkillEntry[] } = {
      playerIds: [],
      entries: [],
    };
    for (const [playerId, group] of byPlayer) {
      if (
        current.playerIds.length > 0 &&
        current.entries.length + group.length > PLAYER_SKILLS_SYNC_CHUNK_SIZE
      ) {
        chunks.push(current);
        current = { playerIds: [], entries: [] };
      }
      current.playerIds.push(playerId);
      current.entries.push(...group);
    }
    if (current.playerIds.length > 0) {
      chunks.push(current);
    }
    return chunks;
  }

  /**
   * One skill entry per natural key, in first-seen order, followed by every
   * characteristic entry untouched.
   */
  private deduplicate(entries: PlayerSkillEntry[]): PlayerSkillEntry[] {
    const characteristics = entries.filter(
      (entry) => entry.source === 'characteristic',
    );
    const byKey = new Map<string, PlayerSkillEntry>();
    for (const entry of entries.filter(
      (candidate) => candidate.source !== 'characteristic',
    )) {
      const key = naturalKey(entry);
      const existing = byKey.get(key);
      const winner =
        existing === undefined || this.wins(entry, existing) ? entry : existing;
      // A merged entry is free when any of its duplicates was.
      const free = entry.isFreeExtra === true || existing?.isFreeExtra === true;
      byKey.set(key, free ? { ...winner, isFreeExtra: true } : winner);
    }
    return [...byKey.values(), ...characteristics];
  }

  /** Whether `candidate` should replace `existing` for the same natural key. */
  private wins(
    candidate: PlayerSkillEntry,
    existing: PlayerSkillEntry,
  ): boolean {
    if (existing.source === 'starting') {
      return candidate.source !== 'starting';
    }
    if (candidate.source === 'starting') {
      return false;
    }
    const candidateOrder = candidate.advancementOrder ?? undefined;
    const existingOrder = existing.advancementOrder ?? undefined;
    if (candidateOrder === undefined) {
      return false;
    }
    return existingOrder === undefined || candidateOrder < existingOrder;
  }
}

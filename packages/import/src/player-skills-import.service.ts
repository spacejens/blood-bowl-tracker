import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

/**
 * How many entries one `syncPlayerSkills` call carries. A deliberate starting
 * point, not a benchmarked value, chosen to match DEFAULT_BATCH_CHUNK_SIZE:
 * the server validates and writes a batch all-or-nothing, so a smaller chunk
 * bounds both the request payload and the blast radius of one failure.
 */
export const PLAYER_SKILLS_SYNC_CHUNK_SIZE = 500;

/** The natural key `player_skills` is unique on. */
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
 * `advancementOrder` wins (the earlier sighting).
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
    entries: PlayerSkillEntry[],
    errors: ImportError[],
  ): Promise<number> {
    const deduplicated = this.deduplicate(entries);
    let synced = 0;
    for (
      let start = 0;
      start < deduplicated.length;
      start += PLAYER_SKILLS_SYNC_CHUNK_SIZE
    ) {
      const chunk = deduplicated.slice(
        start,
        start + PLAYER_SKILLS_SYNC_CHUNK_SIZE,
      );
      const result = await this.importRunner.recordUpsertResult({
        upsert: () => this.client.playerSkills.sync({ entries: chunk }),
        item: { playerSkills: chunk.length },
        errors,
        buildErrorMessage: (err: unknown) =>
          `Failed to sync ${chunk.length} player skill(s): ${
            err instanceof Error ? err.message : String(err)
          }`,
      });
      if (result) {
        synced += chunk.length;
      }
    }
    return synced;
  }

  /** One entry per natural key, in first-seen order. */
  private deduplicate(entries: PlayerSkillEntry[]): PlayerSkillEntry[] {
    const byKey = new Map<string, PlayerSkillEntry>();
    for (const entry of entries) {
      const key = naturalKey(entry);
      const existing = byKey.get(key);
      if (existing === undefined || this.wins(entry, existing)) {
        byKey.set(key, entry);
      }
    }
    return [...byKey.values()];
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

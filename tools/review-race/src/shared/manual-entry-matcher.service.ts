import { Injectable } from '@nestjs/common';

import type { ManualExternalIdRef } from '../source/manual-raw-data.service';
import type { RaceExternalIdRow } from './race-external-ids.service';

/** The shape every curated entry that names a race shares. */
export interface ManualEntryLike {
  name: string;
  externalIds: ManualExternalIdRef[];
}

/**
 * Decides whether a curated entry (from `races-and-positions.json5` or
 * `position-availability.json5`) belongs to a given race — the one question
 * every raw renderer and stratifier that reads the curated files needs to
 * answer, and the single shared rule all of them use, so no caller decides on
 * its own separator convention or on whether to match external ids at all.
 *
 * A curated entry belongs to a race when its `name` equals the race's own
 * stored name, or when any one of its `externalIds` `{system, id}` pairs
 * equals one of the race's own external id rows. Both signals are checked —
 * curated races-and-positions.json5 entries exist specifically to bridge a
 * race whose BBL/TP source name differs from the DB's stored name, so
 * external-id matching is what makes those entries resolve; name matching
 * still applies for entries that carry no external ids of their own (or none
 * that happen to be registered against this race yet).
 *
 * Pure and dependency-free, so specs may inject it as a real provider.
 */
@Injectable()
export class ManualEntryMatcherService {
  /** Does this curated entry belong to the race with this name and ids? */
  matchesRace(
    entry: ManualEntryLike,
    raceName: string,
    ownedIds: readonly RaceExternalIdRow[],
  ): boolean {
    if (entry.name === raceName) {
      return true;
    }
    return entry.externalIds.some((ref) => this.refMatchesRace(ref, ownedIds));
  }

  /** Does this single external-id reference belong to the race's own ids? */
  refMatchesRace(
    ref: ManualExternalIdRef,
    ownedIds: readonly RaceExternalIdRow[],
  ): boolean {
    return ownedIds.some(
      (row) => row.systemName === ref.system && row.externalId === ref.id,
    );
  }
}

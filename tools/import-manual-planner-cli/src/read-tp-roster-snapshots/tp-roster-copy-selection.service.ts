import { Injectable } from '@nestjs/common';

import type {
  TpRosterCopy,
  TpRosterCopyLocation,
} from './tp-roster-copy-reader.service';
import type { TpRosterCopyGroup } from './tp-roster-snapshots.schema';

export interface SelectRosterCopiesInput {
  copies: readonly TpRosterCopy[];
  /** Copies that could not be read, by the group they belong to. */
  unreadable: readonly TpRosterCopyLocation[];
}

interface Collected {
  location: TpRosterCopyLocation;
  copies: TpRosterCopy[];
  undetermined: boolean;
}

/**
 * Tells, per era directory and roster id, which downloaded copy the TP
 * import sends: the one whose newest match finished last, a copy with no
 * finish instant counting as older than any with one. This repeats
 * tools/import-tp's TpRosterFilesImportService.distinctByEraAndRoster; keep
 * the two in step. That one keeps the first copy read on a tie, and the read
 * order is not defined, so here every tied copy counts as sent. A group
 * with an unreadable copy is undetermined: no copy counts as sent.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class TpRosterCopySelectionService {
  select(input: SelectRosterCopiesInput): TpRosterCopyGroup[] {
    const groups = new Map<string, Collected>();
    const groupOf = (location: TpRosterCopyLocation): Collected => {
      const key = JSON.stringify([location.era, location.rosterId]);
      const known = groups.get(key);
      if (known !== undefined) {
        return known;
      }
      const created: Collected = { location, copies: [], undetermined: false };
      groups.set(key, created);
      return created;
    };
    for (const copy of input.copies) {
      groupOf(copy).copies.push(copy);
    }
    for (const location of input.unreadable) {
      groupOf(location).undetermined = true;
    }
    return [...groups.values()]
      .sort((a, b) => this.compareLocations(a.location, b.location))
      .map((group) => this.group(group));
  }

  private group({
    location,
    copies,
    undetermined,
  }: Collected): TpRosterCopyGroup {
    const all = new Set(copies.flatMap((copy) => copy.playerIds));
    const base = { era: location.era, rosterId: location.rosterId };
    if (undetermined) {
      return {
        ...base,
        chosen: [],
        listed: [],
        listedElsewhere: this.ids(all),
      };
    }
    const newest = Math.max(...copies.map((copy) => this.finish(copy)));
    const chosen = copies.filter((copy) => this.finish(copy) === newest);
    const listed = new Set(
      chosen[0].playerIds.filter((id) =>
        chosen.every((copy) => copy.playerIds.includes(id)),
      ),
    );
    return {
      ...base,
      chosen: chosen
        .map((copy) => copy.source)
        .sort((a, b) => this.compare(a, b)),
      listed: this.ids(listed),
      listedElsewhere: this.ids(
        new Set([...all].filter((id) => !listed.has(id))),
      ),
    };
  }

  private finish(copy: TpRosterCopy): number {
    return copy.finishedAt ?? Number.NEGATIVE_INFINITY;
  }

  private ids(ids: ReadonlySet<string>): string[] {
    return [...ids].sort((a, b) => Number(a) - Number(b));
  }

  private compareLocations(
    a: TpRosterCopyLocation,
    b: TpRosterCopyLocation,
  ): number {
    return (
      this.compare(a.era, b.era) || Number(a.rosterId) - Number(b.rosterId)
    );
  }

  /** Code-unit order, so the result does not depend on the runtime's locale. */
  private compare(a: string, b: string): number {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  }
}

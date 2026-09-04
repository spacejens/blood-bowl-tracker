import { Injectable } from '@nestjs/common';

/**
 * BBL names a race after its team page -- "<Race> Team" / "<Race> Teams" --
 * while TP, and this project's canonical race rows, name the same race just
 * "<Race>" (see the header of
 * tools/import-manual/data/before-other-importers/races-and-positions.json5,
 * which pairs the two sources' races by stripping exactly this suffix).
 *
 * Both importers key a position by "<raceName>: <positionName>" under the Name
 * external system (NameExternalIdService.forPosition), so BBL must use the same
 * "<Race>" spelling TP does -- otherwise upsertByExternalIds, which matches on
 * exact (system, id) equality only, sees two unrelated ids and creates two
 * position rows for one real position.
 *
 * tools/review-race's RaceNameComparisonService strips the same suffix for a
 * different purpose (comparing BBL/TP race names for display, case- and
 * whitespace-insensitively) and must stay independent of this package -- see
 * docs/architecture.md's review-race entry -- so the two are not shared, only
 * parallel.
 */
@Injectable()
export class BblRaceNameService {
  /** The BBL race name with its team-page "Team"/"Teams" suffix removed. */
  canonical(name: string): string {
    return name.replace(/ Teams?$/, '');
  }
}

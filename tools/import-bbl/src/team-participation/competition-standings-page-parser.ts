import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';

// e.g. `onclick="gototeam('äng')"`. Team codes can contain non-ASCII letters,
// so capture everything up to the closing quote rather than an ASCII class.
const GOTOTEAM = /gototeam\('([^']+)'\)/;

@Injectable()
export class CompetitionStandingsPageParser {
  constructor(private readonly importResults: ImportResultService) {}

  /**
   * Extract the registered team codes from a competition standings page
   * (`p=se&s=<id>`). Every registered team — including one with a 0-0 record
   * that played no matches — appears as a `<tr class="trlist">` row inside
   * `table.tblist`, with `onclick="gototeam('<code>')"` on each of its cells;
   * the first onclick in the row is enough. A page with no such rows (a
   * not-yet-started competition) yields an empty set. A row whose cells carry
   * no parseable `gototeam(...)` code is recorded as an error and skipped,
   * matching the per-item error tolerance used elsewhere in this importer.
   */
  extractRegisteredTeamIds(page: BblPage, errors: ImportError[]): Set<string> {
    const $ = page.load();
    const teamIds = new Set<string>();
    $('table.tblist tr.trlist').each((_index, rowEl) => {
      const onclick = $(rowEl).find('[onclick]').first().attr('onclick') ?? '';
      const match = GOTOTEAM.exec(onclick);
      if (!match) {
        errors.push(
          this.importResults.error({
            item: { page: page.params },
            message: `Skipping standings row on page ${JSON.stringify(page.params)}: no gototeam(...) team code found.`,
          }),
        );
        return;
      }
      teamIds.add(match[1]);
    });
    return teamIds;
  }
}

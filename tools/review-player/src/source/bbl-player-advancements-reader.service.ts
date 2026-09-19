import { Injectable } from '@nestjs/common';

import type { BblRawPlayerAdvancements } from './bbl-player-skills-cell.service';
import { BblPlayerSkillsCellService } from './bbl-player-skills-cell.service';
import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';

/**
 * One player's BBL advancements: the mirror page located and decoded by the
 * loader, then read by the cell parser. Both the raw renderer and the DB
 * renderer go through this one service, so the panel a reviewer reads and the
 * comparison the imported panel draws can never disagree about what the page
 * says.
 *
 * Results are cached per external id for the lifetime of the process: a
 * single sampled player's advancements are read up to three times (raw
 * renderer, and the DB renderer's own skill list and increase counts), and
 * re-loading and re-parsing the same page each time is pure waste. No
 * eviction is needed — matching the other source services' lifetime-of-process
 * caching (e.g. `BblRawPositionPageService`, `TpSkillMasterNamesService`).
 */
@Injectable()
export class BblPlayerAdvancementsReaderService {
  private readonly cache = new Map<
    string,
    Promise<BblRawPlayerAdvancements | null>
  >();

  constructor(
    private readonly loader: BblRawPlayerPageLoaderService,
    private readonly cell: BblPlayerSkillsCellService,
  ) {}

  async read(externalId: string): Promise<BblRawPlayerAdvancements | null> {
    const cached = this.cache.get(externalId);
    if (cached !== undefined) {
      return cached;
    }
    const promise = this.load(externalId);
    this.cache.set(externalId, promise);
    return promise;
  }

  private async load(
    externalId: string,
  ): Promise<BblRawPlayerAdvancements | null> {
    const page = await this.loader.loadPlayerPage(externalId);
    return page === null ? null : this.cell.parse(page);
  }
}

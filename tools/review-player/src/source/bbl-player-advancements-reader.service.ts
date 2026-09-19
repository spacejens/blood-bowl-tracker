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
 */
@Injectable()
export class BblPlayerAdvancementsReaderService {
  constructor(
    private readonly loader: BblRawPlayerPageLoaderService,
    private readonly cell: BblPlayerSkillsCellService,
  ) {}

  async read(externalId: string): Promise<BblRawPlayerAdvancements | null> {
    const page = await this.loader.loadPlayerPage(externalId);
    return page === null ? null : this.cell.parse(page);
  }
}

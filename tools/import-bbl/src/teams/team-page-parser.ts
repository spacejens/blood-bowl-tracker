import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

/**
 * A team extracted from BBL source data. `id` is the team's alphanumeric BBL
 * page id (the `t` param, e.g. `40g` or `äng`); `name` is its display name.
 */
export interface BblTeam {
  id: string;
  name: string;
}

@Injectable()
export class TeamPageParser {
  /**
   * Extract the team from a team page (`p=tm`). The id is the page's own `t`
   * param; the name is the page's `<h1>` heading text (trimmed). Returns null
   * when the id is missing or the heading is absent/empty. (Retired teams show
   * an additional "Retired!" marker on the same page; that is not tracked yet.)
   */
  extractTeam(page: BblPage): BblTeam | null {
    const id = page.params.t?.trim();
    if (!id) {
      return null;
    }
    const $ = page.load();
    const name = $('h1').first().text().trim();
    if (!name) {
      return null;
    }
    return { id, name };
  }
}

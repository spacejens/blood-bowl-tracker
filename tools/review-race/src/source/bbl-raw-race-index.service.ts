import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';

/** The race-list page: every race BBL knows, with its numeric id. */
const RACE_LIST_PAGE = 'default.asp?p=tl';

/** `default.asp?p=tm&t=<code>` -> `<code>`. */
const TEAM_CODE = /^default\.asp\?p=tm&t=(.+)$/;

/** A race-list link's numeric fragment, as team pages write it. */
const RACE_LINK_ID = /#(\d+)/;

/** What the BBL mirror alone says about one race. */
export interface BblRawRace {
  bblId: string;
  /** Name from the `p=tl` race-list page, or null when absent there. */
  listName: string | null;
  /** Name as the first team page naming this race spells it. */
  teamPageName: string | null;
  /** How many team pages name this race. */
  teamPageCount: number;
  /** The `t=` codes of those team pages, sorted, capped at 10 for display. */
  teamCodes: string[];
}

/** How many team codes a race's raw panel lists before saying "and N more". */
const MAX_TEAM_CODES = 10;

/**
 * Builds, once per process, BBL's own picture of every race: the `p=tl`
 * race-list entries plus every `p=tm` team page's "Race:" field. Both are
 * parsed here with cheerio rather than through tools/import-bbl's parsers —
 * the importer's reading of these pages is what the report exists to check.
 */
@Injectable()
export class BblRawRaceIndexService {
  private index: Promise<Map<string, BblRawRace>> | undefined;

  constructor(private readonly reader: BblMirrorReaderService) {}

  async raceFor(bblId: string): Promise<BblRawRace | null> {
    this.index ??= this.buildIndex();
    return (await this.index).get(bblId) ?? null;
  }

  private async buildIndex(): Promise<Map<string, BblRawRace>> {
    const races = new Map<string, BblRawRace>();
    await this.absorbRaceList(races);
    await this.absorbTeamPages(races);
    for (const race of races.values()) {
      race.teamCodes = race.teamCodes.slice(0, MAX_TEAM_CODES);
    }
    return races;
  }

  /**
   * The race-list page introduces each race with `<a name="<id>">` followed in
   * document order by the `<b>` holding its name.
   */
  private async absorbRaceList(races: Map<string, BblRawRace>): Promise<void> {
    const page = await this.reader.readPage(RACE_LIST_PAGE);
    if (page === null) {
      return;
    }
    const $ = cheerio.load(page);
    let pendingId: string | null = null;
    $('a[name], b').each((_index, element) => {
      const node = $(element);
      if (node.is('a')) {
        const name = node.attr('name') ?? '';
        pendingId = /^\d+$/.test(name) ? name : pendingId;
        return;
      }
      if (pendingId !== null) {
        const raceName = this.text(node.text());
        if (raceName !== '') {
          this.entry(races, pendingId).listName = raceName;
        }
        pendingId = null;
      }
    });
  }

  /** Each team page's "Race:" cell links to `default.asp?p=tl#<id>`. */
  private async absorbTeamPages(races: Map<string, BblRawRace>): Promise<void> {
    for (const filename of await this.reader.listTeamPageFilenames()) {
      const page = await this.reader.readPage(filename);
      if (page === null) {
        continue;
      }
      const parsed = this.parseTeamPageRace(page);
      if (parsed === null) {
        continue;
      }
      const race = this.entry(races, parsed.bblId);
      race.teamPageName ??= parsed.name;
      race.teamPageCount += 1;
      race.teamCodes.push(TEAM_CODE.exec(filename)?.[1] ?? filename);
    }
  }

  private parseTeamPageRace(
    page: string,
  ): { bblId: string; name: string } | null {
    const $ = cheerio.load(page);
    let found: { bblId: string; name: string } | null = null;
    $('td').each((_index, element) => {
      if (this.text($(element).text()) !== 'Race:') {
        return undefined;
      }
      const cell = $(element).next('td');
      const name = this.text(cell.text());
      const bblId = RACE_LINK_ID.exec(cell.find('a').attr('href') ?? '')?.[1];
      if (name !== '' && bblId !== undefined) {
        found = { bblId, name };
        return false;
      }
      return undefined;
    });
    return found;
  }

  private entry(races: Map<string, BblRawRace>, bblId: string): BblRawRace {
    const existing = races.get(bblId);
    if (existing !== undefined) {
      return existing;
    }
    const created: BblRawRace = {
      bblId,
      listName: null,
      teamPageName: null,
      teamPageCount: 0,
      teamCodes: [],
    };
    races.set(bblId, created);
    return created;
  }

  /** Trim, drop the `&nbsp;` (U+00A0) padding, collapse internal runs. */
  private text(raw: string): string {
    return raw.replace(/\xA0/g, ' ').trim().replace(/\s+/g, ' ');
  }
}

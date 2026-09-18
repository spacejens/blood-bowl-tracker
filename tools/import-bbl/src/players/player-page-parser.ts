import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

import type { BblSkillRef } from '../shared/skill-entry.service';
import { SkillEntryService } from '../shared/skill-entry.service';
import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import type { BblLastingInjuries } from './sustained-injuries.parser';
import { SustainedInjuriesParser } from './sustained-injuries.parser';

/**
 * One player's raw characteristics line, exactly as their page shows it. This
 * is deliberately format-agnostic: a `-` in the Passing cell becomes `null`
 * here, and the decision between `null` and `0` is made later, against the
 * rules set of the player's era, by BblPlayersImportService.
 *
 * Parsed independently of BblPositionCharacteristics rather than sharing a
 * helper, matching this package's existing per-entity parser boundaries.
 */
export interface BblPlayerCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/** The characteristics table's header cells, in column order. */
const CHARACTERISTIC_HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'];

/** The label cell that identifies the sustained-injuries row. */
const SUSTAINED_INJURIES_LABEL = 'Sustained Injuries:';

/** How many cells precede the Skills cell in the characteristics row. */
const SKILLS_CELL_INDEX = CHARACTERISTIC_HEADERS.length;

/** The inline colour BBL renders a skill GAINED via advancement in. */
const GAINED_SKILL_COLOUR = '#006020';

/** The inline colour BBL renders the pending "?" advancement marker in. */
const PENDING_MARKER_COLOUR = '#f02020';

/** The pending advancement marker's own, normalized text content. */
const PENDING_MARKER_TEXT = '?';

/**
 * How many times each characteristic was increased by advancement, for one
 * player.
 */
export interface BblPlayerCharacteristicIncreaseCounts {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

/**
 * BBL's Skills cell mixes real skill names with these five pseudo-entries,
 * always rendered in the same "gained" colour as a real advancement skill.
 * Each marks one characteristic-increase advancement rather than a skill, so
 * it is excluded from the returned skill list entirely: no `player_skills`
 * row, and no consumed `advancementOrder` slot. The same marker can appear
 * more than once for one player (e.g. two Agility increases).
 */
const CHARACTERISTIC_INCREASE_MARKERS: Record<
  string,
  keyof BblPlayerCharacteristicIncreaseCounts
> = {
  '+MA': 'move',
  '+ST': 'strength',
  '+AG': 'agility',
  '+PA': 'passing',
  '+AV': 'armour',
};

function zeroCharacteristicIncreaseCounts(): BblPlayerCharacteristicIncreaseCounts {
  return { move: 0, strength: 0, agility: 0, passing: 0, armour: 0 };
}

/**
 * One skill from a player's own Skills cell.
 *
 * BBL distinguishes only plain text (a starting skill) from a coloured span (a
 * skill gained via advancement). It records nothing about HOW a gained skill
 * was gained, which is why every one of them is `advancement` rather than
 * `chosen` or `random` -- unlike TP, which reports the roll outright.
 *
 * `advancementOrder` counts GAINED skills only, 1-based: starting skills
 * interleaved in the same cell do not consume a position in the sequence. It
 * is a presentation-order proxy, not a confirmed sequence.
 */
export interface BblPlayerSkillRef extends BblSkillRef {
  source: 'starting' | 'advancement';
  advancementOrder?: number;
}

/**
 * A player read off a `p=pl` page. `pid` is the player's page id (from
 * `page.params.pid`); `name` is the `<h1>` text. `typId` is the player's
 * position id (the `p=pt&typID=<N>` link); `teamCode` is the player's team
 * page id (the `p=tm&t=<code>` link).
 */
export interface BblPlayer {
  pid: string;
  name: string;
  typId: string;
  teamCode: string;
  /**
   * BBL's own displayed career SPP total — the parenthesized figure on the
   * "Unspent SPP" row (the middle cell is unspent SPP, which can be
   * negative, and is not this). `null` when the row is absent or carries no
   * parenthesized figure. Used only as an input to computing
   * `players.spp_adjustment`; it is never stored as `players.spp_total`,
   * because BBL's figure mixes award rates across eras — its site
   * recalculated pre-BB2020 totals at BB2020 rates, so the raw scraped
   * number isn't the era-correct total this repo wants `spp_total` to mean.
   */
  sppTotal: number | null;
  /**
   * The MA/ST/AG/PA/AV line from the player's own characteristics table.
   * Non-nullable: a page whose line cannot be read fails player extraction
   * entirely, the same way a missing name/position/team link does.
   */
  characteristics: BblPlayerCharacteristics;
  /**
   * The player's currently outstanding lasting injuries, from the page's
   * free-text "Sustained Injuries" row. Non-nullable, and a missing row is
   * NOT a parse failure the way a missing characteristics line is: "no
   * injuries" is an ordinary state that most pages are in, so an absent row
   * reads as all-clean.
   */
  lastingInjuries: BblLastingInjuries;
  /**
   * Every skill the player's Skills cell lists, starting and gained alike, in
   * the cell's own order. Empty when the cell is blank or absent -- a player
   * with no skills at all is an ordinary state, not a parse failure.
   */
  skills: BblPlayerSkillRef[];
  /**
   * How many times each characteristic was increased by advancement, read
   * directly from the `+MA`/`+ST`/`+AG`/`+PA`/`+AV` markers in the Skills
   * cell. Always present with a 0 default per characteristic — a player who
   * never increased a given characteristic is a genuine 0, not an absent
   * value.
   */
  characteristicIncreaseCounts: BblPlayerCharacteristicIncreaseCounts;
}

@Injectable()
export class PlayerPageParser {
  constructor(
    private readonly normalizeText: NormalizeExtractedTextService,
    private readonly sustainedInjuries: SustainedInjuriesParser,
    private readonly skillEntries: SkillEntryService,
  ) {}

  /**
   * Extract player data from a player page. Reads `pid` from the page params,
   * `name` from the `<h1>` element, and `typId`/`teamCode` from position/team
   * links. A player page links its position (`default.asp?p=pt&typID=<digits>`)
   * and its team (`default.asp?p=tm&t=<code>`). The first of each is used.
   * Returns null when the pid, position link, team link, or readable
   * characteristics line is absent, or when the page has no `<h1>` element at
   * all. An `<h1>` that is present but empty is accepted as a valid, empty
   * name (`''`) — some BBL players legitimately have no name.
   */
  extractPlayer(page: BblPage): BblPlayer | null {
    const $ = page.load();
    const pid = page.params.pid;
    const name = this.normalizeText.normalize($('h1').first().text());
    let typId: string | undefined;
    let teamCode: string | undefined;

    $('a').each((_index, element) => {
      const href = $(element).attr('href') ?? '';
      if (!typId) {
        const typMatch = /[?&]p=pt&typID=(\d+)/.exec(href);
        if (typMatch) {
          typId = typMatch[1];
        }
      }
      if (!teamCode) {
        // Team codes can contain non-ASCII letters (e.g. "gås", "häl"), so
        // match everything up to the next query param or fragment rather than
        // an ASCII-only character class.
        const teamMatch = /[?&]p=tm&t=([^&#]+)/.exec(href);
        if (teamMatch) {
          teamCode = teamMatch[1];
        }
      }
    });

    if (!pid || $('h1').length === 0 || !typId || !teamCode) {
      return null;
    }
    const characteristics = this.extractCharacteristics($);
    if (!characteristics) {
      return null;
    }
    const { skills, characteristicIncreaseCounts } = this.extractSkills($);
    return {
      pid,
      name,
      typId,
      teamCode,
      sppTotal: this.extractSppTotal($),
      characteristics,
      lastingInjuries: this.extractLastingInjuries($),
      skills,
      characteristicIncreaseCounts,
    };
  }

  /**
   * The career SPP total from the "Unspent SPP" row: find the label cell,
   * then read the first parenthesized integer in that row. A missing row (or
   * a row with no parenthesized figure) is not an error — the caller treats
   * it as "no total scraped".
   */
  private extractSppTotal($: ReturnType<BblPage['load']>): number | null {
    for (const element of $('td').toArray()) {
      if (this.normalizeText.normalize($(element).text()) !== 'Unspent SPP:') {
        continue;
      }
      const rowText = this.normalizeText.normalize($(element).parent().text());
      const match = /\((\d+)\)/.exec(rowText);
      return match ? Number(match[1]) : null;
    }
    return null;
  }

  /**
   * The sustained-injuries cell, located the same way the SPP total is: find
   * the label cell by its exact text, then read the cell next to it. Cheerio
   * flattens the label's anchor, so the comparison is against plain text.
   *
   * `<br>` is replaced with a space before flattening: `.text()` drops it with
   * no separator, which would glue the miss-next-game sentence onto whatever
   * preceded it ("1 niggling inj.Must miss..."). The parser tolerates that
   * anyway, but keeping the words apart makes the extracted text readable in
   * a debugger and in any future raw rendering of it.
   *
   * A page with no such row yields the all-clean value, not null — see
   * `BblPlayer.lastingInjuries`.
   */
  private extractLastingInjuries($: CheerioAPI): BblLastingInjuries {
    for (const element of $('td').toArray()) {
      if (
        this.normalizeText.normalize($(element).text()) !==
        SUSTAINED_INJURIES_LABEL
      ) {
        continue;
      }
      const valueCell = $(element).next('td');
      if (valueCell.length === 0) {
        // The label WAS found, so this is a malformed/truncated page, not the
        // ordinary "no injury row at all" case handled below. Defaulting to
        // the same clean result here could silently overwrite a genuinely
        // injured player's data if the page ever fails to load completely.
        throw new Error('Invalid sustained-injuries row: missing value cell');
      }
      const html = (valueCell.html() ?? '').replace(/<br\s*\/?>/gi, ' ');
      return this.sustainedInjuries.parse(
        this.normalizeText.normalize($(`<td>${html}</td>`).text()),
      );
    }
    return this.sustainedInjuries.parse('');
  }

  /**
   * The MA/ST/AG/PA/AV values from the player's characteristics table: the row
   * whose first five cells are exactly those headers, and the `td`s of the row
   * immediately after it. A `pl` page carries several `trlisthead` rows, so the
   * table is found by its header *text*, not by its class. Returns null when no
   * such table is found, a required (non-Passing) value is unreadable, or the
   * Passing cell holds something other than a genuine `-` or a readable number.
   */
  private extractCharacteristics(
    $: CheerioAPI,
  ): BblPlayerCharacteristics | null {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.normalizeText.normalize($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      if (cells.length < CHARACTERISTIC_HEADERS.length) {
        return null;
      }
      const texts = cells
        .slice(0, CHARACTERISTIC_HEADERS.length)
        .map((cell) => this.normalizeText.normalize($(cell).text()));
      const [moveText, strengthText, agilityText, passingText, armourText] =
        texts;
      const move = this.parseCharacteristic(moveText);
      const strength = this.parseCharacteristic(strengthText);
      const agility = this.parseCharacteristic(agilityText);
      const armour = this.parseCharacteristic(armourText);
      // Passing is the only column where `-` is a legitimate value; anything
      // else that fails to parse (garbage text, an empty cell) rejects the
      // whole line, rather than being silently accepted as if it were a `-`.
      const passing =
        passingText === '-' ? null : this.parseCharacteristic(passingText);
      if (
        move === null ||
        strength === null ||
        agility === null ||
        armour === null ||
        (passingText !== '-' && passing === null)
      ) {
        return null;
      }
      return { move, strength, agility, passing, armour };
    }
    return null;
  }

  /**
   * One characteristics cell: parses a plain or `+`-suffixed number (the
   * trailing `+` is display formatting the database does not store),
   * returning null for anything unparseable. Matches the whole cell text
   * against the expected shape first — `Number.parseInt` alone would accept
   * a numeric prefix followed by garbage (e.g. `parseInt('6x', 10) === 6`).
   */
  private parseCharacteristic(text: string): number | null {
    if (!/^\d+\+?$/.test(text)) {
      return null;
    }
    return Number.parseInt(text, 10);
  }

  /**
   * The Skills cell of the player's characteristics table: the sixth cell of
   * the row after the MA/ST/AG/PA/AV header row. Returns an empty skill list
   * and all-zero increase counts when there is no such table, no sixth cell,
   * or the cell is blank.
   */
  private extractSkills($: CheerioAPI): {
    skills: BblPlayerSkillRef[];
    characteristicIncreaseCounts: BblPlayerCharacteristicIncreaseCounts;
  } {
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.normalizeText.normalize($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      const skillsCell = cells[SKILLS_CELL_INDEX];
      if (skillsCell === undefined) {
        return {
          skills: [],
          characteristicIncreaseCounts: zeroCharacteristicIncreaseCounts(),
        };
      }
      return this.readSkillsCell($, skillsCell);
    }
    return {
      skills: [],
      characteristicIncreaseCounts: zeroCharacteristicIncreaseCounts(),
    };
  }

  /**
   * Split one Skills cell into refs, walking its child nodes rather than its
   * flattened text: the starting-vs-gained distinction is carried ONLY by the
   * inline colour of a wrapping span, which `.text()` throws away.
   *
   * Commas live in the cell's plain text nodes and never inside a coloured
   * span, so an entry is built by accumulating text until the next comma; a
   * coloured span encountered while accumulating marks the entry in progress
   * as gained.
   *
   * A coloured span whose only content is the red "?" marker is a pending,
   * unresolved advancement roll -- an ordinary mid-advancement state with no
   * skill to record yet -- so it contributes no text and its entry is dropped.
   *
   * A resolved ref whose name is exactly one of the five characteristic-
   * increase markers (`+MA`/`+ST`/`+AG`/`+PA`/`+AV`) is not a skill at all: it
   * is excluded from the returned list and does not consume an
   * `advancementOrder` slot, and instead increments that characteristic's
   * count. The same marker can appear more than once for one player.
   */
  private readSkillsCell(
    $: CheerioAPI,
    cell: AnyNode,
  ): {
    skills: BblPlayerSkillRef[];
    characteristicIncreaseCounts: BblPlayerCharacteristicIncreaseCounts;
  } {
    const refs: BblPlayerSkillRef[] = [];
    const characteristicIncreaseCounts = zeroCharacteristicIncreaseCounts();
    let gainedCount = 0;
    let text = '';
    let gained = false;

    const flush = (): void => {
      const entry = this.normalizeText.normalize(text);
      text = '';
      const wasGained = gained;
      gained = false;
      if (entry.length === 0) {
        return;
      }
      for (const ref of this.skillEntries.resolveSkillRefs(entry)) {
        if (Object.hasOwn(CHARACTERISTIC_INCREASE_MARKERS, ref.name)) {
          const characteristic = CHARACTERISTIC_INCREASE_MARKERS[ref.name];
          characteristicIncreaseCounts[characteristic] += 1;
          continue;
        }
        if (!wasGained) {
          refs.push({ ...ref, source: 'starting' });
          continue;
        }
        gainedCount += 1;
        refs.push({
          ...ref,
          source: 'advancement',
          advancementOrder: gainedCount,
        });
      }
    };

    for (const node of $(cell).contents().toArray()) {
      const element = $(node);
      const colour = element.attr('style') ?? '';
      if (colour.includes(GAINED_SKILL_COLOUR)) {
        // A nested red "?" is the pending marker; removing ONLY that specific
        // nested span (matched by its own colour or its exact "?" text)
        // leaves an empty span, which flush() then drops as the empty entry
        // it is. Scoped this narrowly rather than removing every nested span
        // unconditionally, so a real skill's text nested inside a gained
        // span for some other reason is not silently dropped alongside it.
        const inner = element.clone();
        inner.find('span').each((_index, span) => {
          const spanElement = $(span);
          const spanColour = spanElement.attr('style') ?? '';
          const spanText = this.normalizeText.normalize(spanElement.text());
          if (
            spanColour.includes(PENDING_MARKER_COLOUR) ||
            spanText === PENDING_MARKER_TEXT
          ) {
            spanElement.remove();
          }
        });
        const value = this.normalizeText.normalize(inner.text());
        if (value.length > 0) {
          text += value;
          gained = true;
        }
        continue;
      }
      const parts = element.text().split(',');
      text += parts[0];
      for (const part of parts.slice(1)) {
        flush();
        text = part;
      }
    }
    flush();
    return { skills: refs, characteristicIncreaseCounts };
  }
}

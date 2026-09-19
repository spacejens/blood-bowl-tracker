import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

/** The characteristics table's header cells, in column order. */
const CHARACTERISTIC_HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'] as const;

/** How many cells precede the Skills cell in the characteristics row. */
const SKILLS_CELL_INDEX = CHARACTERISTIC_HEADERS.length;

/** The inline colour BBL renders a skill GAINED via advancement in. */
const GAINED_SKILL_COLOUR = '#006020';

/** The inline colour BBL renders the pending "?" advancement marker in. */
const PENDING_MARKER_COLOUR = '#f02020';

/** The pending advancement marker's own, normalized text content. */
const PENDING_MARKER_TEXT = '?';

/** A trailing parenthetical value; the space before the paren is optional. */
const PARENTHETICAL_VALUE = /^(.+?) ?\(([^()]+)\)$/;

/** How many times each characteristic was raised by advancement. */
export interface RawIncreaseCounts {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

/**
 * BBL mixes five pseudo-entries into the Skills cell, in the same colour as a
 * gained skill. Each marks one characteristic increase, not a skill.
 */
const INCREASE_MARKERS: Record<string, keyof RawIncreaseCounts> = {
  '+MA': 'move',
  '+ST': 'strength',
  '+AG': 'agility',
  '+PA': 'passing',
  '+AV': 'armour',
};

/**
 * One skill from a player's Skills cell. BBL distinguishes only plain text (a
 * starting skill) from a coloured span (a gained one) — it records nothing
 * about HOW a gained skill was gained, so nothing here says random or chosen.
 */
export interface BblRawPlayerSkill {
  name: string;
  attributeValue: string | null;
  source: 'starting' | 'gained';
  /** 1-based among gained skills only; null for a starting skill. */
  advancementOrder: number | null;
}

/** Everything the BBL page says about one player's advancements. */
export interface BblRawPlayerAdvancements {
  skills: BblRawPlayerSkill[];
  increaseCounts: RawIncreaseCounts;
}

function zeroCounts(): RawIncreaseCounts {
  return { move: 0, strength: 0, agility: 0, passing: 0, armour: 0 };
}

/**
 * Reads a BBL player page's Skills cell on this tool's own terms, walking the
 * cell's child nodes rather than its flattened text: the starting-vs-gained
 * distinction is carried ONLY by the inline colour of a wrapping span, which
 * `.text()` throws away.
 *
 * Commas live in plain text nodes and never inside a coloured span, so an
 * entry accumulates text until the next comma; a coloured span seen while
 * accumulating marks that entry gained. A coloured span whose only content is
 * the red "?" is a pending, unresolved advancement roll and contributes
 * nothing.
 *
 * Deliberately not `tools/import-bbl`'s `PlayerPageParser`: the importer's
 * reading of this cell is exactly what the report exists to check, so reusing
 * it would let a misreading agree with itself. Unlike the importer, no
 * garbled-entry repair table is applied — a garbled entry is a finding.
 *
 * Null means "no Skills cell on this page", which is different from an empty
 * cell (a player with no skills at all).
 */
@Injectable()
export class BblPlayerSkillsCellService {
  parse(page: string): BblRawPlayerAdvancements | null {
    const $ = cheerio.load(page);
    for (const row of $('tr').toArray()) {
      const headers = $(row)
        .children('th, td')
        .toArray()
        .map((cell) => this.normalize($(cell).text()));
      if (CHARACTERISTIC_HEADERS.some((header, i) => headers[i] !== header)) {
        continue;
      }
      const cells = $(row).next('tr').children('td').toArray();
      const skillsCell = cells[SKILLS_CELL_INDEX];
      return skillsCell === undefined ? null : this.readCell($, skillsCell);
    }
    return null;
  }

  private readCell(
    $: cheerio.CheerioAPI,
    cell: AnyNode,
  ): BblRawPlayerAdvancements {
    const skills: BblRawPlayerSkill[] = [];
    const increaseCounts = zeroCounts();
    let gainedCount = 0;
    let text = '';
    let gained = false;

    const flush = (): void => {
      const entry = this.normalize(text);
      text = '';
      const wasGained = gained;
      gained = false;
      if (entry.length === 0) {
        return;
      }
      const { name, attributeValue } = this.split(entry);
      if (Object.hasOwn(INCREASE_MARKERS, name)) {
        increaseCounts[INCREASE_MARKERS[name]] += 1;
        return;
      }
      if (!wasGained) {
        skills.push({
          name,
          attributeValue,
          source: 'starting',
          advancementOrder: null,
        });
        return;
      }
      gainedCount += 1;
      skills.push({
        name,
        attributeValue,
        source: 'gained',
        advancementOrder: gainedCount,
      });
    };

    for (const node of $(cell).contents().toArray()) {
      const element = $(node);
      if ((element.attr('style') ?? '').includes(GAINED_SKILL_COLOUR)) {
        const value = this.normalize(this.withoutPendingMarker($, element));
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
    return { skills, increaseCounts };
  }

  /**
   * A gained span's text with any nested pending "?" marker removed. Scoped
   * to that specific nested span (by its own colour or its exact "?" text) so
   * a real skill nested inside a gained span for some other reason is not
   * dropped with it.
   */
  private withoutPendingMarker(
    $: cheerio.CheerioAPI,
    element: cheerio.Cheerio<AnyNode>,
  ): string {
    const inner = element.clone();
    inner.find('span').each((_index, span) => {
      const spanElement = $(span);
      const colour = spanElement.attr('style') ?? '';
      const spanText = this.normalize(spanElement.text());
      if (
        colour.includes(PENDING_MARKER_COLOUR) ||
        spanText === PENDING_MARKER_TEXT
      ) {
        spanElement.remove();
      }
    });
    return inner.text();
  }

  private split(entry: string): {
    name: string;
    attributeValue: string | null;
  } {
    const match = PARENTHETICAL_VALUE.exec(entry);
    return match === null
      ? { name: entry, attributeValue: null }
      : { name: match[1], attributeValue: match[2] };
  }

  private normalize(raw: string): string {
    return raw.replace(/\xA0/g, ' ').trim().replace(/\s+/g, ' ');
  }
}

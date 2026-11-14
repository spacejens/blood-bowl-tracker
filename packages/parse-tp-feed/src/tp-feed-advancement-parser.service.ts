import { Injectable } from '@nestjs/common';

import type {
  TpFeedAdvancementCategory,
  TpFeedAdvancementGain,
  TpFeedAdvancementParseResult,
  TpFeedAdvancementSelection,
  TpFeedCharacteristic,
  TpFeedPlayerLine,
} from './tp-feed-advancement';
import type { TpFeedEmbedLike } from './tp-feed-embed';

/** `` `#10` Helmut Cool *(Imperial Thrower)* `` */
const PLAYER_LINE_PATTERN =
  /^`#(?<number>[^`]+)`\s+(?<name>.+?)\s+\*\((?<position>[^)]+)\)\*$/u;

/** "Random Primary Wrestle ★3", "Primary Block ★16" (collapsed value text). */
const VALUE_PATTERN =
  /^(?:Random\s+)?(?<category>Primary|Secondary|Characteristics)\s+(?<gain>.+?)\s+★(?<spp>\d+)$/u;

/** "+1 AG" */
const CHARACTERISTIC_PATTERN =
  /^(?<delta>[+-]\d+)\s+(?<characteristic>MA|ST|AG|PA|AV)$/u;

const CATEGORIES: Readonly<Record<string, TpFeedAdvancementCategory>> = {
  Primary: 'primary',
  Secondary: 'secondary',
  Characteristics: 'characteristics',
};

/** What the value text says, each part null when it was not understood. */
interface ValueParts {
  readonly selection: TpFeedAdvancementSelection | null;
  readonly category: TpFeedAdvancementCategory | null;
  readonly gain: TpFeedAdvancementGain | null;
  readonly sppCost: number | null;
}

const UNKNOWN_VALUE: ValueParts = {
  selection: null,
  category: null,
  gain: null,
  sppCost: null,
};

/**
 * Reads one TP `New skill/characteristic` embed. Pure and non-throwing:
 * a missing part fails the parse naming the part, and a value whose wording
 * is not understood still parses with the parts it could not read set to
 * null, so each caller decides how tolerant to be.
 */
@Injectable()
export class TpFeedAdvancementParserService {
  parse(embed: TpFeedEmbedLike): TpFeedAdvancementParseResult {
    const field = embed.fields?.at(0);
    const player = this.parsePlayerLine(field?.name);
    if (!player) return { ok: false, failedField: 'player field' };
    const teamName = embed.footer?.text;
    if (!teamName) return { ok: false, failedField: 'footer.text' };
    const rosterLink = embed.author?.url;
    if (!rosterLink) return { ok: false, failedField: 'author.url' };
    const rawValue = field?.value ?? '';
    const valueText = this.collapse(rawValue);
    if (!valueText) return { ok: false, failedField: 'field value' };
    return {
      ok: true,
      advancement: {
        ...player,
        teamName,
        rosterLink,
        ...this.parseValue(valueText),
        valueText,
        rawValue,
      },
    };
  }

  parsePlayerLine(name: string | undefined): TpFeedPlayerLine | null {
    const groups = name ? PLAYER_LINE_PATTERN.exec(name)?.groups : undefined;
    if (!groups) return null;
    return {
      playerNumber: groups.number,
      playerName: groups.name,
      position: groups.position,
    };
  }

  /**
   * `` "Random Primary ` Guard ` ` ★8 `" `` → "Random Primary Guard ★8".
   * Backticks become spaces (rather than being deleted) so the words they
   * separate do not run together, and the result's whitespace is collapsed.
   */
  private collapse(value: string): string {
    return value.replaceAll('`', ' ').replace(/\s+/gu, ' ').trim();
  }

  private parseValue(valueText: string): ValueParts {
    const groups = VALUE_PATTERN.exec(valueText)?.groups;
    if (!groups) return UNKNOWN_VALUE;
    const category = CATEGORIES[groups.category];
    return {
      selection: valueText.startsWith('Random ') ? 'random' : 'chosen',
      category,
      gain: this.parseGain(category, groups.gain),
      sppCost: Number(groups.spp),
    };
  }

  private parseGain(
    category: TpFeedAdvancementCategory,
    gainText: string,
  ): TpFeedAdvancementGain | null {
    if (category !== 'characteristics') return { skill: gainText };
    const groups = CHARACTERISTIC_PATTERN.exec(gainText)?.groups;
    if (!groups) return null;
    return {
      characteristic: groups.characteristic as TpFeedCharacteristic,
      delta: Number(groups.delta),
    };
  }
}

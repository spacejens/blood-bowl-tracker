import { Injectable } from '@nestjs/common';
import { ButtonStyle, ComponentType } from 'discord.js';

import type { ButtonCustomIdPrefix } from './deepdive/button-custom-ids';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  LEAGUE_BUTTON_CUSTOM_ID_PREFIX,
  ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from './deepdive/button-custom-ids';

/** Discord allows at most 5 buttons per action row and 5 action rows per message. */
const MAX_BUTTONS_PER_ROW = 5;
const MAX_ACTION_ROWS = 5;

/** Most entries that can still be shown as one button each (5 rows × 5 buttons). */
const MAX_BUTTON_ENTRIES = MAX_BUTTONS_PER_ROW * MAX_ACTION_ROWS;

/** Discord allows at most 25 options in a single string select menu. */
const MAX_OPTIONS_PER_SELECT = 25;

/** Infix that turns a routing prefix into a select menu's own custom id. */
const SELECT_MENU_CUSTOM_ID_INFIX = 'menu:';

/**
 * Discord rejects a button or select-menu option with an empty label, which
 * fails the whole interaction. Some imported entities genuinely have no name,
 * so blank labels fall back to a zero-width space: valid for Discord (unlike
 * a non-breaking space, which Discord's API rejects as blank too — verified
 * against the live API), and visually blank, matching the fact that there is
 * no name to show.
 */
const BLANK_LABEL = '\u200b';

/**
 * Emoji for a feature scoped to a specific calendar date rather than to one
 * entity: the on-this-date insight's embed title, and the date drill-down
 * buttons the date toplists render. Exported separately as well as keyed into
 * `ENTITY_EMOJI_BY_PREFIX`, because the embed title uses it outside any button
 * context.
 */
export const CALENDAR_EMOJI = '📅';

/**
 * The button colour each destination type gets, so a coach can tell coach
 * buttons from team buttons from player buttons at a glance without reading
 * every label. Discord offers only four usable styles (Link navigates to a
 * URL and Premium is for purchases), so some of the ten destination types share colours:
 * the five "container" types (era, competition, competition group, league, trophy)
 * share Secondary, and the three "who played" types (coach, team, race) share
 * Success, because red would read as a destructive-action colour for routine
 * navigation among these look-alike types. Player is the sole user of
 * Primary. Star player takes Danger, the last unused style: it is the one
 * destination type that is not routine navigation but a single marquee entity
 * (a hired mercenary, not a team/coach/race a coach browses through), so red
 * reads as "special/headline" there rather than "destructive".
 *
 * The `Record<ButtonCustomIdPrefix, ButtonStyle>` annotation is deliberate:
 * TypeScript requires every member of the union to appear as a key, so adding
 * a further prefix constant fails the build here until someone chooses its
 * colour. Do not add a runtime fallback — that would let a new destination
 * type ship silently mis-coloured.
 */
const BUTTON_STYLE_BY_PREFIX: Record<ButtonCustomIdPrefix, ButtonStyle> = {
  [ERA_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [COMPETITION_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [LEAGUE_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [TROPHY_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [COACH_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Success,
  [TEAM_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Success,
  [PLAYER_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Primary,
  [STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Danger,
  [RACE_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Success,
};

/**
 * The emoji each destination type gets, rendered by Discord in the component's
 * own `emoji` field (not prefixed into the label). Colour alone cannot carry
 * type identity: Discord offers only four usable button styles for ten and
 * counting destination types, and select-menu options have no colour at all,
 * so a coach and a competition would be indistinguishable in a long list.
 * Emoji is the primary type signal; `BUTTON_STYLE_BY_PREFIX` remains an
 * independent secondary one.
 *
 * The choices: a clock for a time period (era), a clipboard for
 * tactics/coaching (coach), a shield for a team crest (team), a jersey for an
 * individual player (player), a star for a star player (star-player), a double
 * helix for species/ancestry (race), a stadium for a single event
 * (competition), a repeat symbol for a recurring series (competition group),
 * a classical building for the institution a whole league is, one level above
 * the competition group's repeat symbol (league), a trophy cup for an award
 * (trophy), and a calendar for a recurring calendar date (on-this-date).
 *
 * The `Record<ButtonCustomIdPrefix, string>` annotation is deliberate, exactly
 * as it is for the colour map above: TypeScript requires every member of the
 * union to appear as a key, so adding a further prefix constant fails the build
 * here until someone chooses its emoji. Do not add a runtime fallback — that
 * would let a new destination type ship with the wrong icon.
 */
const ENTITY_EMOJI_BY_PREFIX: Record<ButtonCustomIdPrefix, string> = {
  [ERA_BUTTON_CUSTOM_ID_PREFIX]: '🕰️',
  [COACH_BUTTON_CUSTOM_ID_PREFIX]: '📋',
  [TEAM_BUTTON_CUSTOM_ID_PREFIX]: '🛡️',
  [PLAYER_BUTTON_CUSTOM_ID_PREFIX]: '🎽',
  [STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX]: '⭐',
  [RACE_BUTTON_CUSTOM_ID_PREFIX]: '🧬',
  [COMPETITION_BUTTON_CUSTOM_ID_PREFIX]: '🏟️',
  [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX]: '🔁',
  [LEAGUE_BUTTON_CUSTOM_ID_PREFIX]: '🏛️',
  [TROPHY_BUTTON_CUSTOM_ID_PREFIX]: '🏆',
  [ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX]: CALENDAR_EMOJI,
};

/** One drill-down target: a routing prefix (see `deepdive/button-custom-ids.ts`), the bare entity id, and the text to show. */
export interface EntityComponentEntry {
  customIdPrefix: ButtonCustomIdPrefix;
  entityId: string;
  label: string;
}

interface EntityButton {
  type: ComponentType.Button;
  style: ButtonStyle;
  label: string;
  custom_id: string;
  /** Discord's native button emoji field; `name` is the unicode emoji itself. */
  emoji: { name: string };
}

export interface EntityButtonRow {
  type: ComponentType.ActionRow;
  components: EntityButton[];
}

interface EntitySelectOption {
  label: string;
  value: string;
  /** Discord's native option emoji field; `name` is the unicode emoji itself. */
  emoji: { name: string };
}

interface EntitySelectMenu {
  type: ComponentType.StringSelect;
  custom_id: string;
  placeholder: string;
  options: EntitySelectOption[];
}

export interface EntitySelectRow {
  type: ComponentType.ActionRow;
  components: EntitySelectMenu[];
}

type EntityComponentRow = EntityButtonRow | EntitySelectRow;

export interface EntityComponents {
  components: EntityComponentRow[];
  /**
   * Line to append to the embed description when entries did not fit, e.g.
   * `…and 3 more without a link.`; `null` when everything got a component.
   * The embed text still lists those entries — only their drill-down
   * component is missing, hence "without a link" rather than "not shown".
   */
  overflowNote: string | null;
}

/**
 * Builds the drill-down components for a list of entities. Shared by the
 * `/insights` leaderboard and era-list embeds and every `/deepdive` fact, so
 * the dedupe/cap/chunk/select logic lives in exactly one place.
 *
 * Up to `MAX_BUTTON_ENTRIES` entries render as buttons (the long-standing UX).
 * Past that a message cannot show a button each, so the whole list switches to
 * select menus — one menu per routing prefix group, chunked to
 * `MAX_OPTIONS_PER_SELECT` options, until the 5 action rows are used up.
 * Anything left over is reported through `overflowNote` instead of being
 * dropped silently.
 */
@Injectable()
export class EntityComponentsService {
  buildEntityComponents(entries: EntityComponentEntry[]): EntityComponents {
    const resolved = entries.map((entry) => ({
      ...entry,
      label: this.resolveLabel(entry.label),
    }));
    const unique = this.dedupe(resolved);
    if (unique.length <= MAX_BUTTON_ENTRIES) {
      return { components: this.buildButtonRows(unique), overflowNote: null };
    }
    const { rows, rendered } = this.buildSelectRows(unique);
    const dropped = unique.length - rendered;
    return {
      components: rows,
      overflowNote: dropped > 0 ? `…and ${dropped} more without a link.` : null,
    };
  }

  /**
   * The emoji for a destination type, so a consumer that is *not* rendering a
   * component can still show the same type icon — the deepdive fact services
   * prefix their embed headline with it, so the headline matches the button
   * that opened it. Reads the same exhaustive `ENTITY_EMOJI_BY_PREFIX` map the
   * buttons and select-menu options use, so the two can never drift apart.
   */
  getEmojiForPrefix(prefix: ButtonCustomIdPrefix): string {
    return ENTITY_EMOJI_BY_PREFIX[prefix];
  }

  /** Trims a label, substituting `BLANK_LABEL` when nothing is left. */
  private resolveLabel(label: string): string {
    const trimmed = label.trim();
    return trimmed === '' ? BLANK_LABEL : trimmed;
  }

  /** Discord rejects duplicate custom ids in one message; keep the first. */
  private dedupe(entries: EntityComponentEntry[]): EntityComponentEntry[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const customId = `${entry.customIdPrefix}${entry.entityId}`;
      if (seen.has(customId)) {
        return false;
      }
      seen.add(customId);
      return true;
    });
  }

  private buildButtonRows(entries: EntityComponentEntry[]): EntityButtonRow[] {
    return this.chunk(entries, MAX_BUTTONS_PER_ROW).map((chunkEntries) => ({
      type: ComponentType.ActionRow as const,
      components: chunkEntries.map((entry) => ({
        type: ComponentType.Button as const,
        style: BUTTON_STYLE_BY_PREFIX[entry.customIdPrefix],
        label: entry.label,
        custom_id: `${entry.customIdPrefix}${entry.entityId}`,
        emoji: { name: ENTITY_EMOJI_BY_PREFIX[entry.customIdPrefix] },
      })),
    }));
  }

  private buildSelectRows(entries: EntityComponentEntry[]): {
    rows: EntitySelectRow[];
    rendered: number;
  } {
    const rows: EntitySelectRow[] = [];
    let rendered = 0;
    for (const [prefix, group] of this.groupByPrefix(entries)) {
      const budget = MAX_ACTION_ROWS - rows.length;
      if (budget <= 0) {
        break;
      }
      const chunks = this.chunk(group, MAX_OPTIONS_PER_SELECT).slice(0, budget);
      chunks.forEach((chunkEntries, index) => {
        rows.push({
          type: ComponentType.ActionRow as const,
          components: [
            {
              type: ComponentType.StringSelect as const,
              // Menu index is global to the message, so two prefix groups can
              // never collide on a custom id; the prefix keeps `startsWith`
              // routing in DiscordClientService working unchanged.
              custom_id: `${prefix}${SELECT_MENU_CUSTOM_ID_INFIX}${rows.length}`,
              placeholder:
                chunks.length > 1
                  ? `Choose one (part ${index + 1} of ${chunks.length})`
                  : 'Choose one',
              options: chunkEntries.map((entry) => ({
                label: entry.label,
                value: entry.entityId,
                emoji: { name: ENTITY_EMOJI_BY_PREFIX[entry.customIdPrefix] },
              })),
            },
          ],
        });
        rendered += chunkEntries.length;
      });
    }
    return { rows, rendered };
  }

  /** Groups entries by routing prefix, preserving first-appearance order. */
  private groupByPrefix(
    entries: EntityComponentEntry[],
  ): Map<string, EntityComponentEntry[]> {
    const groups = new Map<string, EntityComponentEntry[]>();
    for (const entry of entries) {
      const group = groups.get(entry.customIdPrefix);
      if (group === undefined) {
        groups.set(entry.customIdPrefix, [entry]);
      } else {
        group.push(entry);
      }
    }
    return groups;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}

import { Injectable } from '@nestjs/common';
import { ButtonStyle, ComponentType } from 'discord.js';

import type { ButtonCustomIdPrefix } from './deepdive/button-custom-ids';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
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
 * a non-breaking space, which Discord's API rejects as blank too — confirmed
 * against the live API while fixing #350), and visually blank, matching the
 * fact that there is no name to show.
 */
const BLANK_LABEL = '\u200b';

/**
 * The button colour each destination type gets, so a coach can tell coach
 * buttons from team buttons from player buttons at a glance without reading
 * every label. Discord offers only four usable styles (Link navigates to a
 * URL and Premium is for purchases), so with six destination types some
 * share a colour: the two "container" types (era, competition) share
 * Secondary, and the three "who played" types (coach, team, race) share
 * Success \u2014 race used to be Danger, but red read as a destructive-action
 * colour for what is just normal navigation. Player is the sole user of
 * Primary. Danger is unused by design: not a reserved fallback, just that no
 * current destination type happens to warrant it.
 *
 * The `Record<ButtonCustomIdPrefix, ButtonStyle>` annotation is deliberate:
 * TypeScript requires every member of the union to appear as a key, so adding
 * a seventh prefix constant fails the build here until someone chooses its
 * colour. Do not add a runtime fallback \u2014 that would let a new destination
 * type ship silently mis-coloured.
 */
const BUTTON_STYLE_BY_PREFIX: Record<ButtonCustomIdPrefix, ButtonStyle> = {
  [ERA_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [COMPETITION_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Secondary,
  [COACH_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Success,
  [TEAM_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Success,
  [PLAYER_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Primary,
  [RACE_BUTTON_CUSTOM_ID_PREFIX]: ButtonStyle.Success,
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
}

export interface EntityButtonRow {
  type: ComponentType.ActionRow;
  components: EntityButton[];
}

interface EntitySelectOption {
  label: string;
  value: string;
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

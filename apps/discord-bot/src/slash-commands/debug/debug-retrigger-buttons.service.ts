import { Injectable } from '@nestjs/common';
import { ButtonStyle, ComponentType } from 'discord.js';

import { DEBUG_RETRIGGER_CUSTOM_ID_PREFIX } from './debug-custom-ids';

/** Discord allows at most 5 buttons per action row. */
const MAX_BUTTONS_PER_ROW = 5;

interface RetriggerButton {
  type: ComponentType.Button;
  style: ButtonStyle.Secondary;
  label: string;
  custom_id: string;
}

export interface RetriggerButtonRow {
  type: ComponentType.ActionRow;
  components: RetriggerButton[];
}

/**
 * The numbered retrigger buttons under the `/debuginteractions` embed: one
 * per listed row, labelled with that row's number so button 3 and line 3
 * refer to the same interaction.
 *
 * `MAX_DEBUG_INTERACTIONS` is 20, which is exactly four rows of five —
 * comfortably inside Discord's 5×5 component ceiling, so there is no
 * overflow case to handle here (unlike `EntityComponentsService`, which can
 * be handed arbitrarily many entries).
 *
 * Pure assembly with no dependencies, so specs for its consumers pass it as a
 * real provider (see CLAUDE.md, "A pure, dependency-free formatting service
 * is the other [exception]").
 */
@Injectable()
export class DebugRetriggerButtonsService {
  build(eventIds: number[]): RetriggerButtonRow[] {
    const rows: RetriggerButtonRow[] = [];
    for (let start = 0; start < eventIds.length; start += MAX_BUTTONS_PER_ROW) {
      rows.push({
        type: ComponentType.ActionRow,
        components: eventIds
          .slice(start, start + MAX_BUTTONS_PER_ROW)
          .map((eventId, offset) => ({
            type: ComponentType.Button as const,
            style: ButtonStyle.Secondary as const,
            label: String(start + offset + 1),
            custom_id: `${DEBUG_RETRIGGER_CUSTOM_ID_PREFIX}${eventId}`,
          })),
      });
    }
    return rows;
  }
}

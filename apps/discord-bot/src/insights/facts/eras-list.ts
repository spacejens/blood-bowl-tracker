import type { ErasService, FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';
import { ButtonStyle, ComponentType } from 'discord.js';

import { withDatabaseTimeout } from '../../database-timeout';
import {
  ERAS_LIST_NO_DATA_MESSAGE,
  ERAS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { ERA_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';

interface EraEntry {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
}

/** Discord allows at most 5 buttons per action row and 5 rows per message. */
const MAX_BUTTONS_PER_ROW = 5;
const MAX_BUTTON_ROWS = 5;
const MAX_BUTTONS = MAX_BUTTONS_PER_ROW * MAX_BUTTON_ROWS;

export async function resolveErasList(
  eras: ErasService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout(eras.listErasWithLeague(scope), null);
  if (rows === null) {
    return ERAS_LIST_TIMEOUT_MESSAGE;
  }
  if (rows.length === 0) {
    return {
      embeds: [{ title: 'Eras', description: ERAS_LIST_NO_DATA_MESSAGE }],
    };
  }

  const ordered: EraEntry[] = rows
    .slice()
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.leagueName.localeCompare(b.leagueName) ||
        a.name.localeCompare(b.name),
    );

  const lines = ordered.map((era) => {
    const end = era.endDate ?? 'present';
    return `${era.name} (${era.leagueName}): ${era.startDate} – ${end}`;
  });

  const buttons = ordered.slice(0, MAX_BUTTONS).map((era) => ({
    type: ComponentType.Button as const,
    style: ButtonStyle.Primary as const,
    label: era.name,
    custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}${era.id}`,
  }));

  const components: {
    type: ComponentType.ActionRow;
    components: typeof buttons;
  }[] = [];
  for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
    components.push({
      type: ComponentType.ActionRow as const,
      components: buttons.slice(i, i + MAX_BUTTONS_PER_ROW),
    });
  }

  return {
    embeds: [{ title: 'Eras', description: lines.join('\n') }],
    components,
  };
}

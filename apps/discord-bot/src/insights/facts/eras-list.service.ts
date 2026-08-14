import type { FactScope } from '@blood-bowl-tracker/game-data';
import { ErasService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { ERA_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { EntityComponentsService } from '../../entity-components.service';
import {
  ERAS_LIST_NO_DATA_MESSAGE,
  ERAS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';

interface EraEntry {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
}

@Injectable()
export class ErasListService {
  constructor(
    private readonly eras: ErasService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly dateRangeFormatter: DateRangeFormatterService,
  ) {}

  async resolve(scope: FactScope): Promise<string | InteractionReplyOptions> {
    const rows = await this.databaseTimeout.run(
      this.eras.listErasWithLeague(scope),
      null,
    );
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

    const lines = ordered.map(
      (era) =>
        `${era.name} (${era.leagueName}): ${this.dateRangeFormatter.format(era.startDate, era.endDate)}`,
    );

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        ordered.map((era) => ({
          customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(era.id),
          label: era.name,
        })),
      );
    if (overflowNote !== null) {
      lines.push(overflowNote);
    }

    return {
      embeds: [{ title: 'Eras', description: lines.join('\n') }],
      components,
    };
  }
}

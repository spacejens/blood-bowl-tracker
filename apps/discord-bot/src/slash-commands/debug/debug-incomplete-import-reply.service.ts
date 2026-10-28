import { IncompleteImportPlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';
import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';

import { DEBUG_INCOMPLETE_IMPORT_NO_RESULTS_MESSAGE } from '../../error-messages';
import { DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX } from './debug-custom-ids';
import { IncompleteImportReportService } from './incomplete-import-report.service';

/** The embed's title; the report page is its description. */
const TITLE = 'Incomplete import data';

interface PageButton {
  type: ComponentType.Button;
  style: ButtonStyle.Secondary;
  label: string;
  custom_id: string;
  disabled: boolean;
}

interface PageButtonRow {
  type: ComponentType.ActionRow;
  components: PageButton[];
}

/**
 * Builds the `/debugincompleteimport` reply for one page, shared by the
 * command (page 1) and its Previous/Next buttons (any page). Stateless: the
 * report is re-queried and re-paginated every time, so a button only needs
 * to carry a page number. A requested page outside the current range - the
 * data may have changed since the button was rendered - is clamped to the
 * nearest valid page rather than refused.
 *
 * The Previous button at page 1 points at page 0 and the Next button at the
 * last page points one past it; both are disabled, and the two ids still
 * differ, as Discord requires within one message.
 */
@Injectable()
export class DebugIncompleteImportReplyService {
  constructor(
    private readonly players: IncompleteImportPlayersService,
    private readonly report: IncompleteImportReportService,
  ) {}

  async buildReply(page: number): Promise<InteractionReplyOptions> {
    const rows = await this.players.findTeamsWithIncompletePlayers();
    const pages = this.report.buildPages(rows);
    if (pages.length === 0) {
      return {
        content: DEBUG_INCOMPLETE_IMPORT_NO_RESULTS_MESSAGE,
        flags: MessageFlags.Ephemeral,
      };
    }
    const current = Math.min(Math.max(page, 1), pages.length);
    return {
      embeds: [
        {
          title: TITLE,
          description: pages[current - 1],
          footer: { text: `Page ${current}/${pages.length}` },
        },
      ],
      components: [this.navigation(current, pages.length)],
      flags: MessageFlags.Ephemeral,
    };
  }

  private navigation(current: number, pageCount: number): PageButtonRow {
    return {
      type: ComponentType.ActionRow,
      components: [
        this.button('Previous', current - 1, current === 1),
        this.button('Next', current + 1, current === pageCount),
      ],
    };
  }

  private button(label: string, target: number, disabled: boolean): PageButton {
    return {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      label,
      custom_id: `${DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX}${target}`,
      disabled,
    };
  }
}

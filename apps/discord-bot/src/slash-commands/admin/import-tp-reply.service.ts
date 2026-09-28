import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import type { TpImportOutcome } from '../../tp-import/tp-import-dispatch.service';
import type {
  TpImportAssessment,
  TpImportStatus,
} from '../../tp-import/tp-import-failure.service';
import { TpImportFailureService } from '../../tp-import/tp-import-failure.service';

/** The status line for each import status. */
const STATUS_LINES: Record<TpImportStatus, string> = {
  completed: '**Completed**',
  completedWithErrors: '**Completed with errors**',
  failed: '**Failed**',
};

/**
 * Turns a TP import outcome into `/importtp`'s ephemeral reply: one embed
 * with a status line, a bullet per stage and every stage error. What the
 * status is and how stages and errors are labelled is decided by
 * `TpImportFailureService`, shared with the TP feed so both agree; this
 * service only renders it.
 *
 * Pure formatting whose only collaborator is itself pure and
 * dependency-free, so specs may pass both real.
 */
@Injectable()
export class ImportTpReplyService {
  constructor(private readonly failure: TpImportFailureService) {}

  build(outcome: TpImportOutcome): InteractionReplyOptions {
    const assessment = this.failure.assess(outcome);
    return {
      embeds: [
        {
          title: `TP import: ${assessment.subject}`,
          description: this.enforceDescriptionLimit(this.describe(assessment)),
        },
      ],
      flags: MessageFlags.Ephemeral,
    };
  }

  private describe(assessment: TpImportAssessment): string {
    const sections = [
      [STATUS_LINES[assessment.status], ...assessment.notes].join('\n'),
      assessment.rows.map((row) => `- ${row.label}: ${row.summary}`).join('\n'),
    ];
    if (assessment.errors.length > 0) {
      sections.push(
        [
          '**Errors**',
          ...assessment.errors.map(
            (error) => `- ${error.label}: ${error.message}`,
          ),
        ].join('\n'),
      );
    }
    return sections.join('\n\n');
  }

  /**
   * Defense in depth for Discord's embed description limit, the same hard
   * truncation `DebugFilterUsageCommandService.enforceDescriptionLimit` uses:
   * error lists are uncapped, so a large failing import can reach it.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}

import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { ErrorListFitService } from '../../tp-import/error-list-fit.service';
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

/** Heads the list of every error the import reported. */
const ERRORS_HEADER = '**Errors**';

/**
 * Turns a TP import outcome into `/importtp`'s ephemeral reply: one embed
 * with a status line, a bullet per stage and the stage errors, or the short
 * reply given instead when TP is blocking requests. What the status is and
 * how stages and errors are labelled is decided by `TpImportFailureService`,
 * shared with the TP feed so both agree; this service only renders it. Errors
 * that do not all fit Discord's embed limit are cut to the leading ones that
 * do, with a note counting the rest, by `ErrorListFitService`.
 *
 * Pure formatting whose only collaborators are themselves pure and
 * dependency-free, so specs may pass them real.
 */
@Injectable()
export class ImportTpReplyService {
  constructor(
    private readonly failure: TpImportFailureService,
    private readonly errorListFit: ErrorListFitService,
  ) {}

  build(outcome: TpImportOutcome): InteractionReplyOptions {
    const assessment = this.failure.assess(outcome);
    return this.reply(
      `TP import: ${assessment.subject}`,
      this.describe(assessment),
    );
  }

  /**
   * The reply for an import that threw instead of returning an outcome —
   * something the import did not collect as an error, such as the database
   * being unreachable. The command is admin-only and the reply ephemeral,
   * so showing the raw message is acceptable.
   */
  buildUnexpectedFailure(error: unknown): InteractionReplyOptions {
    const message =
      error instanceof Error ? error.message || error.name : String(error);
    return this.reply(
      'TP import failed',
      this.withErrors(STATUS_LINES.failed, [`- Unexpected error: ${message}`]),
    );
  }

  private reply(title: string, description: string): InteractionReplyOptions {
    return {
      embeds: [
        { title, description: this.enforceDescriptionLimit(description) },
      ],
      flags: MessageFlags.Ephemeral,
    };
  }

  /**
   * The reply when TP is blocking requests: nothing was imported, and TP is
   * not contacted again before `retryAt`. Discord's own timestamp markup
   * shows the time in each viewer's zone; it is rounded up to the second so
   * "after that" is never early.
   */
  blocked(retryAt: Date): InteractionReplyOptions {
    const at = Math.ceil(retryAt.getTime() / 1000);
    return {
      content: `TP is blocking requests (HTTP 403 Access denied), so nothing was imported. The bot sends TP nothing more until <t:${at}:f> (<t:${at}:R>); try again after that.`,
      flags: MessageFlags.Ephemeral,
    };
  }

  private describe(assessment: TpImportAssessment): string {
    const head = [
      [STATUS_LINES[assessment.status], ...assessment.notes].join('\n'),
      assessment.rows.map((row) => `- ${row.label}: ${row.summary}`).join('\n'),
    ].join('\n\n');
    return this.withErrors(
      head,
      assessment.errors.map((error) => `- ${error.label}: ${error.message}`),
    );
  }

  /**
   * Appends the errors section after `head`, fitting its lines into what is
   * left of Discord's embed description limit. No errors, no section.
   */
  private withErrors(head: string, errorLines: string[]): string {
    if (errorLines.length === 0) {
      return head;
    }
    const prefix = `${head}\n\n${ERRORS_HEADER}\n`;
    const fitted = this.errorListFit.fit(
      errorLines,
      MAX_DESCRIPTION_LENGTH - prefix.length,
    );
    return `${prefix}${fitted.join('\n')}`;
  }

  /**
   * Final safety net for Discord's embed description limit, the same hard
   * truncation `DebugFilterUsageCommandService.enforceDescriptionLimit`
   * uses: the errors are already fitted, but the stage rows and notes ahead
   * of them are not.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}

import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * The one error the team and player upserts share for a roster whose era is
 * not among the imported eras, so both word it identically.
 */
@Injectable()
export class TpRosterEraErrorService {
  constructor(private readonly importResults: ImportResultService) {}

  /** An ImportError for a roster whose era name is not among the imported eras. */
  unknownEraError(era: string, roster: TpRoster): ImportError {
    return this.importResults.error({
      item: { era, roster: roster.id },
      message: `Unknown era "${era}" for roster ${roster.id}: not found among imported eras.`,
    });
  }
}

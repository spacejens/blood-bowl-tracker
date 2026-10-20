import type { CompetitionType } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/**
 * A match-date span (latest minus earliest) of at most this many days makes a
 * competition a cup, anything longer a season. Validated against the BBL
 * mirror's competitions (see docs/import-bbl/file-format.md); do not change.
 */
const CUP_MAX_SPAN_DAYS = 3;

/**
 * The cup-versus-season rule every importer classifies a competition by:
 * tools/import-bbl and packages/import-tp-live (which serves both the live
 * TP import and tools/import-tp's bulk run). Pure and constructor-free.
 */
@Injectable()
export class CompetitionTypeService {
  /** `spanDays` may be fractional. */
  fromSpanDays(spanDays: number): CompetitionType {
    return spanDays <= CUP_MAX_SPAN_DAYS ? 'cup' : 'season';
  }
}

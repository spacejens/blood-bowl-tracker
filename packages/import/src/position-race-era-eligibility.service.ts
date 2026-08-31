import { Injectable } from '@nestjs/common';

export interface PositionRaceEraEligibilityInput {
  /**
   * A curated per-(position, race, era) decision, when the source has one.
   * `undefined` means no override was authored — not "unavailable".
   */
  override: boolean | undefined;
  /** Star players are available in every era they are known for. */
  isStarPlayer: boolean;
  /** A player was actually recorded using this position in this era. */
  hasPositiveEvidence: boolean;
}

/**
 * The single rule deciding whether a position was available for a race in an
 * era, shared by every source that imports `positions_race_eras`.
 *
 * Strictly positive evidence: an override wins outright, else a star player
 * counts, else a recorded use counts, else the position was not available.
 * Absence of data is never read as availability — a row that exists is a
 * claim the position really was playable, which is what makes the row's
 * characteristics meaningful.
 *
 * Pure and dependency-free on purpose, so BBL, TP and any future source
 * reach exactly the same verdict from the same three facts.
 */
@Injectable()
export class PositionRaceEraEligibilityService {
  isEligible({
    override,
    isStarPlayer,
    hasPositiveEvidence,
  }: PositionRaceEraEligibilityInput): boolean {
    if (override !== undefined) {
      return override;
    }
    return isStarPlayer || hasPositiveEvidence;
  }
}

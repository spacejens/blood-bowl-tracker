import type {
  ReviewSource as HarnessReviewSource,
  Sampled,
} from '@blood-bowl-tracker/review-harness';

export type {
  ReviewGap,
  ReviewSource,
  ReviewStratum,
} from '@blood-bowl-tracker/review-harness';
export { REVIEW_SOURCES } from '@blood-bowl-tracker/review-harness';

/**
 * A player identified within one source's data. `externalId` is BBL's `pid` or
 * TP's line-up `id`, from `players_external_ids.external_id`. A player
 * reachable from both sources appears once per source — each source has its
 * own raw panel to compare against.
 */
export interface ReviewPlayer {
  source: HarnessReviewSource;
  /** game_data.players.id */
  playerId: number;
  /** The source's own player id, from players_external_ids.external_id. */
  externalId: string;
  playerName: string;
  teamName: string;
  positionName: string;
  eraName: string;
}

/** A player selected for review by one or more strata. */
export type SampledPlayer = Sampled<ReviewPlayer>;

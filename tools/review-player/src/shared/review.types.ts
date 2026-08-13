/** The import sources this tool can review data from. */
export type ReviewSource = 'bbl' | 'tp';

/** Every source, in the order the report presents them. */
export const REVIEW_SOURCES: readonly ReviewSource[] = ['bbl', 'tp'];

/**
 * A player identified within one source's data. `externalId` is BBL's `pid` or
 * TP's line-up `id`, from `players_external_ids.external_id`. A player
 * reachable from both sources appears once per source — each source has its
 * own raw panel to compare against.
 */
export interface ReviewPlayer {
  source: ReviewSource;
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
export interface SampledPlayer extends ReviewPlayer {
  selectedFor: string[];
}

/** A reason a data type could not review a player. */
export interface ReviewGap {
  source: ReviewSource;
  reason: string;
}

/** A sampling stratum: a grouping the player-stratifier uses for selection. */
export interface ReviewStratum {
  id: string;
  label: string;
  sources: readonly ReviewSource[];
}

import type { SampledPlayer } from './review.types';

/**
 * DI token for the array of data-type reviewers. NestJS has no multi-provider
 * pattern (no `@Multiple()` decorator), so the list is assembled by hand in
 * `harness.module.ts`, not by the framework.
 */
export const PLAYER_DATA_TYPE_REVIEWERS = Symbol('PLAYER_DATA_TYPE_REVIEWERS');

/**
 * A plugin that produces the raw and imported views for one aspect of player
 * data (e.g. star player points, career stats). One per data type.
 */
export interface PlayerDataTypeReviewer {
  /** Unique identifier for this reviewer within the harness. */
  readonly id: string;
  /** Label for the raw-source panel header, or undefined to use a default. */
  readonly rawPanelLabel?: string;
  /** Label for the imported-view panel header, or undefined to use a default. */
  readonly importedPanelLabel?: string;
  /**
   * The player's raw data for this aspect, fetched from the source's raw
   * downloaded files.
   */
  getRawSource(player: SampledPlayer): Promise<string>;
  /**
   * The player's data for this aspect, as it appears in the imported
   * database.
   */
  getImportedView(player: SampledPlayer): Promise<string>;
}

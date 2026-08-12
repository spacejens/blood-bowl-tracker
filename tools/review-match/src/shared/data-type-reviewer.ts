import type { SampledMatch } from './review.types';

/**
 * DI token for the list of every registered `DataTypeReviewer`. NestJS has no
 * multi-provider mechanism, so the array is assembled in one place —
 * `harness.module.ts` — and injected here as a whole.
 */
export const DATA_TYPE_REVIEWERS = Symbol('DATA_TYPE_REVIEWERS');

/**
 * One reviewable data type (v1: match events). The harness calls every
 * registered reviewer for every sampled match and puts the two returned HTML
 * fragments side by side. Fragments are opaque to the harness.
 */
export interface DataTypeReviewer {
  /** Stable slug, e.g. `'match-events'`; shown as the panel-pair heading. */
  readonly id: string;
  /**
   * Heading for the left panel. Defaults to `Raw source (<SOURCE>)`, which
   * only fits a reviewer whose left panel really is the source's own file. A
   * reviewer that derives its left panel some other way (e.g. by recomputing
   * a value from the database) sets its own heading here.
   */
  readonly rawPanelLabel?: string;
  /** Heading for the right panel. Defaults to `Imported (database)`. */
  readonly importedPanelLabel?: string;
  /** The source's own raw data for this match, as an HTML fragment. */
  getRawSource(match: SampledMatch): Promise<string>;
  /** What the importer actually stored, as an HTML fragment. */
  getImportedView(match: SampledMatch): Promise<string>;
}

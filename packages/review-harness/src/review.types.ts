/**
 * The sources a review tool can review data against. `'manual'` is the
 * hand-curated data under `tools/import-manual/data/` — an independent source
 * a review tool must be able to check against, not part of "what got
 * imported".
 */
export type ReviewSource = 'bbl' | 'tp' | 'manual';

/** Every source, in the order the report presents them. */
export const REVIEW_SOURCES: readonly ReviewSource[] = ['bbl', 'tp', 'manual'];

/** Something a report could not cover — reported, never a run failure. */
export interface ReviewGap {
  source: ReviewSource;
  reason: string;
}

/** One sampling stratum a data-type module offers. */
export interface ReviewStratum {
  /** Stable id used to look the stratum's query up. */
  id: string;
  /** Human-readable description shown in the report. */
  label: string;
  /** Sources this stratum applies to. */
  sources: readonly ReviewSource[];
}

/**
 * A reviewed entity plus the human-readable reasons it was picked. Each tool
 * binds this to its own entity type (`Sampled<ReviewMatch>`,
 * `Sampled<ReviewPlayer>`).
 */
export type Sampled<TEntity> = TEntity & {
  /** Stratum labels and/or `'override'`; never empty. */
  selectedFor: string[];
};

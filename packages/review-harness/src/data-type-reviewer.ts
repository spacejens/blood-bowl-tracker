/**
 * DI token for the list of every registered `DataTypeReviewer`. NestJS has no
 * multi-provider mechanism, so the array is assembled in one place — each
 * tool's `harness.module.ts`, via `createRegistryProvider` — and injected here
 * as a whole.
 */
export const DATA_TYPE_REVIEWERS = Symbol('DATA_TYPE_REVIEWERS');

/**
 * One reviewable data type (match events, player info, SPP totals, ...). The
 * harness calls every registered reviewer for every sampled entity and puts
 * the two returned HTML fragments side by side. Fragments are opaque to the
 * harness.
 */
export interface DataTypeReviewer<TEntity> {
  /** Stable slug, e.g. `'match-events'`; shown as the panel-pair heading. */
  readonly id: string;
  /** Label for the raw-source panel header, or undefined to use a default. */
  readonly rawPanelLabel?: string;
  /** Label for the imported-view panel header, or undefined for a default. */
  readonly importedPanelLabel?: string;
  /** The source's own raw data for this entity, as an HTML fragment. */
  getRawSource(entity: TEntity): Promise<string>;
  /** What the importer actually stored, as an HTML fragment. */
  getImportedView(entity: TEntity): Promise<string>;
}

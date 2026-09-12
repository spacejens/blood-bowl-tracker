/**
 * How an external system relates to our data:
 *  - `bookkeeping` — artificial, added by us for internal purposes (the
 *    synthetic "Name" fallback system). Never counted, in any view.
 *  - `imported_data_source` — a genuine external system we import structured
 *    data from (e.g. a league-tracking site an importer scrapes). The only
 *    category counted in statistics.
 *  - `referenced_not_imported` — a genuine external system we reference (an
 *    identifier is stored against an entity) but don't import structured data
 *    from (e.g. a coach's NAF number). Not counted in statistics — the
 *    identifier describes the entity it's stored against, not something tied
 *    to any particular era/competition/league.
 */
export const EXTERNAL_SYSTEM_CATEGORIES = [
  'bookkeeping',
  'imported_data_source',
  'referenced_not_imported',
] as const;

/**
 * The synthetic name-based external system every importer also registers
 * records under: "Name" (matching by exact name). It is a bookkeeping
 * construct — every entity gets a canonical name to fall back on — not a real
 * data source, so it carries category 'bookkeeping'. Centralized here so the
 * literal string has exactly one definition, shared by game-data and every
 * import tool.
 */
export const NAME_EXTERNAL_SYSTEM_NAME = 'Name';

export const NAME_EXTERNAL_SYSTEM = {
  name: NAME_EXTERNAL_SYSTEM_NAME,
  category: 'bookkeeping',
} as const;

/**
 * Name of the fixed, non-configurable external system NAF-linked coaches are
 * also registered under: NAF (matching by NAF number). A coach's NAF number
 * is a stable, cross-league identifier we reference but do not import
 * structured data from, so it carries category 'referenced_not_imported'.
 * Only import-tp uses this today, but it isn't TP-specific, so it lives here
 * alongside the other well-known external systems.
 */
export const NAF_EXTERNAL_SYSTEM_NAME = 'NAF';

export const NAF_EXTERNAL_SYSTEM = {
  name: NAF_EXTERNAL_SYSTEM_NAME,
  category: 'referenced_not_imported',
} as const;

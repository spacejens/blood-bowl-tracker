/**
 * The synthetic name-based external system every importer also registers
 * records under: "Name" (matching by exact name). It is a bookkeeping
 * construct — every entity gets a canonical name to fall back on — not a real
 * data source, so it carries category 'bookkeeping'. Centralized here so
 * game-data no longer needs to know the literal string and every import tool
 * shares one definition.
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

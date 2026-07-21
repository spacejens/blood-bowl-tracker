/**
 * The synthetic name-based external system every importer also registers
 * records under: "Name" (matching by exact name). It is a bookkeeping
 * construct — every entity gets a canonical name to fall back on — not a real
 * data source, so it carries isBookkeeping: true. Centralized here so
 * game-data no longer needs to know the literal string and every import tool
 * shares one definition.
 */
export const NAME_EXTERNAL_SYSTEM_NAME = 'Name';

export const NAME_EXTERNAL_SYSTEM = {
  name: NAME_EXTERNAL_SYSTEM_NAME,
  isBookkeeping: true,
} as const;

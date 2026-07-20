/**
 * Name of the cross-tool external system every TP data-type importer also
 * registers records under: Name (matching by exact name). The canonical TP
 * external system's name is configurable and resolved at runtime by
 * ExternalSystemNameConfigService, not hardcoded here.
 */
export const NAME_EXTERNAL_SYSTEM_NAME = 'Name';

/**
 * Name of the fixed, non-configurable external system NAF-linked coaches are
 * also registered under: NAF (matching by NAF number). Unlike the canonical TP
 * system name (configurable via ExternalSystemNameConfigService), this is a
 * constant — a coach's NAF number is a stable, cross-league identifier.
 */
export const NAF_EXTERNAL_SYSTEM_NAME = 'NAF';

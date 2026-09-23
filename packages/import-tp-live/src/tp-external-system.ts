/**
 * The external system TP records are registered under: this package's own
 * default, used directly by the live import. `tpRosters.import` takes the
 * name as input instead, so the bulk import (`tools/import-tp`) passes
 * whatever name its own `externalSystemName` config resolved to, which is
 * usually this same value but is not tied to it.
 */
export const TP_EXTERNAL_SYSTEM_NAME = 'TP';

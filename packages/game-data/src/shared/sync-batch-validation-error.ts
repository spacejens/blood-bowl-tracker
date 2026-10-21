import { GameDataError } from './game-data-error';

/**
 * An authored-data problem in a sync batch, found before anything is
 * written: the batch names the same natural key twice, or an entry
 * references a row that does not exist. Every sync service's own validation
 * error extends this, so the API maps the whole family to BAD_REQUEST in one
 * place and an importer reports it against the offending entry, rather than
 * seeing a raw database error or an entry that was silently skipped.
 *
 * Thrown directly by nothing: each service throws its own subclass, so the
 * error's class still says which kind of sync rejected the batch.
 */
export class SyncBatchValidationError extends GameDataError {}

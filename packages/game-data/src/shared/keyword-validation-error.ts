import { SyncBatchValidationError } from './sync-batch-validation-error';

/**
 * An authored-data mistake in a position-keyword sync: a position/rules-set
 * pair with no characteristics recorded, an entry naming a keyword that does
 * not exist, or one batch naming the same triple twice. Classified as BAD_REQUEST at the API boundary, because it is
 * feedback for the caller's entry rather than a server fault.
 *
 * Both this and SkillValidationError extend SyncBatchValidationError, which
 * the API maps to BAD_REQUEST. The subclasses stay distinct so that an error's
 * class and message name the right domain: a keyword problem is never
 * reported as a skill one.
 */
export class KeywordValidationError extends SyncBatchValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'KeywordValidationError';
  }
}

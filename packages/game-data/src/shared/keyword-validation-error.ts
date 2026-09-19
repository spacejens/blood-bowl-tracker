/**
 * An authored-data mistake in a position-keyword sync: a position/rules-set
 * pair with no characteristics recorded, or one batch naming the same triple
 * twice. Classified as BAD_REQUEST at the API boundary, because it is
 * feedback for the caller's entry rather than a server fault.
 *
 * Separate from SkillValidationError rather than reused: the two carry
 * different rules (a keyword has no per-rules-set availability row to check
 * against), and a shared class would make the api-server mapping claim a
 * skill problem for a keyword one.
 */
export class KeywordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeywordValidationError';
  }
}

/**
 * Base class of every error class this package defines. Its only job is to set
 * `name` to the concrete class's name, so a logged or stringified error
 * says which error it is (`MissingRequiredFieldError: …`) rather than a bare
 * `Error: …`. `instanceof` checks are unaffected.
 *
 * Internal to this package (not re-exported from index.ts).
 */
export class GameDataError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

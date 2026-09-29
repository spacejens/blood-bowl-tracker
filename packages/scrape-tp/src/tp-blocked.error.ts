/**
 * TP answered a request with 403 "Access denied": it is blocking this
 * client. Thrown for that response and, until `retryAt`, for every further
 * request from any session in the process, none of which is sent to TP.
 * An import that meets it should stop rather than carry on to its next
 * item, since every further request fails the same way.
 */
export class TpBlockedError extends Error {
  /** The earliest time a request is sent to TP again. */
  readonly retryAt: Date;

  constructor(retryAt: Date) {
    super(
      `TP is blocking requests (HTTP 403 Access denied); no request is sent to TP before ${retryAt.toISOString()}`,
    );
    this.name = 'TpBlockedError';
    this.retryAt = retryAt;
  }
}

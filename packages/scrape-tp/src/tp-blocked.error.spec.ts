import { describe, expect, it } from 'vitest';

import { TpBlockedError } from './tp-blocked.error';

describe('TpBlockedError', () => {
  const retryAt = new Date('2026-09-29T12:05:00.000Z');

  it('carries when TP may next be contacted', () => {
    expect(new TpBlockedError(retryAt).retryAt).toBe(retryAt);
  });

  it('says TP is blocking requests and until when', () => {
    const error = new TpBlockedError(retryAt);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TpBlockedError');
    expect(error.message).toBe(
      'TP is blocking requests (HTTP 403 Access denied); no request is sent to TP before 2026-09-29T12:05:00.000Z',
    );
  });

  it('says TP itself answered by default: the request reached TP', () => {
    expect(new TpBlockedError(retryAt).answeredByTp).toBe(true);
  });

  it('carries no interrupted-backfill signal until an import sets one', () => {
    const error = new TpBlockedError(retryAt);

    expect(error.backfillInterrupted).toBeUndefined();
    error.backfillInterrupted = true;
    expect(error.backfillInterrupted).toBe(true);
  });

  it('can say the request was refused without contacting TP', () => {
    expect(
      new TpBlockedError(retryAt, { answeredByTp: false }).answeredByTp,
    ).toBe(false);
  });
});

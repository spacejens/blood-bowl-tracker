import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AcquireReviewLockOutcomeService } from './acquire-review-lock-outcome.service';

describe('AcquireReviewLockOutcomeService', () => {
  let service: AcquireReviewLockOutcomeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AcquireReviewLockOutcomeService],
    }).compile();
    service = moduleRef.get(AcquireReviewLockOutcomeService);
  });

  it('recognises an acquire-review-lock dispatch that took the lock', () => {
    expect(
      service.wasSuccessfulAcquire('acquire-review-lock', {
        acquired: true,
        waitedMs: 12,
      }),
    ).toBe(true);
  });

  it('rejects an acquire that timed out without taking the lock', () => {
    expect(
      service.wasSuccessfulAcquire('acquire-review-lock', {
        acquired: false,
        timedOut: true,
      }),
    ).toBe(false);
  });

  it('rejects a result with no acquired field', () => {
    expect(
      service.wasSuccessfulAcquire('acquire-review-lock', { released: true }),
    ).toBe(false);
  });

  it('rejects a non-boolean acquired value', () => {
    expect(
      service.wasSuccessfulAcquire('acquire-review-lock', { acquired: 'yes' }),
    ).toBe(false);
  });

  it('rejects results that are not objects', () => {
    expect(service.wasSuccessfulAcquire('acquire-review-lock', null)).toBe(
      false,
    );
    expect(service.wasSuccessfulAcquire('acquire-review-lock', undefined)).toBe(
      false,
    );
    expect(
      service.wasSuccessfulAcquire('acquire-review-lock', 'acquired'),
    ).toBe(false);
  });

  it('rejects another subcommand even when it reports acquired', () => {
    expect(
      service.wasSuccessfulAcquire('release-review-lock', { acquired: true }),
    ).toBe(false);
  });
});

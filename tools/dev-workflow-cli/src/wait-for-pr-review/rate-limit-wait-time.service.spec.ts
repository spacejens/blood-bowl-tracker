import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RateLimitWaitTimeService } from './rate-limit-wait-time.service';

const SUBMITTED_AT = '2026-08-15T22:00:00Z';
const SUBMITTED_EPOCH = Math.floor(new Date(SUBMITTED_AT).getTime() / 1000);
/** The fixed slack added to every parsed wait. */
const BUFFER = 60;

describe('RateLimitWaitTimeService', () => {
  let service: RateLimitWaitTimeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RateLimitWaitTimeService],
    }).compile();
    service = moduleRef.get(RateLimitWaitTimeService);
  });

  function availableAt(body: string): number | undefined {
    return service.availableAt({ body, submittedAt: SUBMITTED_AT });
  }

  it('reads a wait in minutes, anchored to submittedAt, plus the buffer', () => {
    expect(
      availableAt('Please wait 12 minutes before requesting another review.'),
    ).toBe(SUBMITTED_EPOCH + 12 * 60 + BUFFER);
  });

  it('converts hours to minutes', () => {
    expect(availableAt('Reviews are available again in 2 hours.')).toBe(
      SUBMITTED_EPOCH + 2 * 3600 + BUFFER,
    );
  });

  it('matches the unit case-insensitively', () => {
    expect(availableAt('Retry in 1 HOUR.')).toBe(
      SUBMITTED_EPOCH + 3600 + BUFFER,
    );
  });

  it('skips a duration in a sentence that states no wait', () => {
    expect(
      availableAt('You used 3 minutes of review time. Retry in 5 minutes.'),
    ).toBe(SUBMITTED_EPOCH + 5 * 60 + BUFFER);
  });

  it('splits on line breaks as well as sentence ends', () => {
    expect(availableAt('Rate limit exceeded\nretry in 7 minutes')).toBe(
      SUBMITTED_EPOCH + 7 * 60 + BUFFER,
    );
  });

  it('returns undefined when no wait duration is stated', () => {
    expect(availableAt('Please wait a while before trying again.')).toBe(
      undefined,
    );
  });
});

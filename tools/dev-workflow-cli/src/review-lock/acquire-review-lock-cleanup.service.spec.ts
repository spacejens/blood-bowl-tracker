import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { AcquireReviewLockCleanupService } from './acquire-review-lock-cleanup.service';
import { AcquireReviewLockOutcomeService } from './acquire-review-lock-outcome.service';
import { ReviewLockService } from './review-lock.service';
import { ReviewLockArgsService } from './review-lock-args.service';

describe('AcquireReviewLockCleanupService', () => {
  let service: AcquireReviewLockCleanupService;
  let outcome: MockProxy<AcquireReviewLockOutcomeService>;
  let args: MockProxy<ReviewLockArgsService>;
  let lock: MockProxy<ReviewLockService>;

  beforeEach(async () => {
    outcome = mock<AcquireReviewLockOutcomeService>();
    args = mock<ReviewLockArgsService>();
    lock = mock<ReviewLockService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AcquireReviewLockCleanupService,
        { provide: AcquireReviewLockOutcomeService, useValue: outcome },
        { provide: ReviewLockArgsService, useValue: args },
        { provide: ReviewLockService, useValue: lock },
      ],
    }).compile();
    service = moduleRef.get(AcquireReviewLockCleanupService);
  });

  const argv = ['node', 'main.js', 'acquire-review-lock', 'branch-a'] as const;

  it('releases the lock when the outcome service reports a successful acquire', async () => {
    outcome.wasSuccessfulAcquire.mockReturnValue(true);
    args.parse.mockReturnValue({ holderId: 'branch-a' });

    await service.releaseIfAcquired(
      'acquire-review-lock',
      { acquired: true },
      argv,
    );

    expect(outcome.wasSuccessfulAcquire).toHaveBeenCalledWith(
      'acquire-review-lock',
      { acquired: true },
    );
    expect(args.parse).toHaveBeenCalledWith(argv);
    expect(lock.release).toHaveBeenCalledWith('branch-a');
  });

  it('does nothing when the outcome service reports no successful acquire', async () => {
    outcome.wasSuccessfulAcquire.mockReturnValue(false);

    await service.releaseIfAcquired(
      'acquire-review-lock',
      { acquired: false },
      argv,
    );

    expect(args.parse).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('propagates a rejection from release()', async () => {
    outcome.wasSuccessfulAcquire.mockReturnValue(true);
    args.parse.mockReturnValue({ holderId: 'branch-a' });
    lock.release.mockRejectedValue(new Error('release blew up'));

    await expect(
      service.releaseIfAcquired(
        'acquire-review-lock',
        { acquired: true },
        argv,
      ),
    ).rejects.toThrow('release blew up');
  });

  it('propagates a throw from parsing argv', async () => {
    outcome.wasSuccessfulAcquire.mockReturnValue(true);
    args.parse.mockImplementation(() => {
      throw new Error('Usage: bad argv');
    });

    await expect(
      service.releaseIfAcquired(
        'acquire-review-lock',
        { acquired: true },
        argv,
      ),
    ).rejects.toThrow('Usage: bad argv');
    expect(lock.release).not.toHaveBeenCalled();
  });
});

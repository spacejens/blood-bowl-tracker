import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupAlertIssuesService } from './backup-alert-issues.service';
import { BackupAlertKind } from './backup-alert-kinds';
import { ResolveAlertService } from './resolve-alert.service';

const KIND: BackupAlertKind = {
  id: 'verify',
  title: 'Production backup verification failed',
  failure: 'Verification failed.',
};
const RUN_URL =
  'https://github.com/spacejens/blood-bowl-tracker/actions/runs/456';

describe('ResolveAlertService', () => {
  let service: ResolveAlertService;
  let issues: MockProxy<BackupAlertIssuesService>;

  beforeEach(async () => {
    issues = mock<BackupAlertIssuesService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ResolveAlertService,
        { provide: BackupAlertIssuesService, useValue: issues },
      ],
    }).compile();
    service = moduleRef.get(ResolveAlertService);
  });

  it('closes every open issue of the kind, linking the successful run', async () => {
    issues.findOpen.mockResolvedValue([
      { number: 9, title: KIND.title },
      { number: 12, title: KIND.title },
    ]);

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).resolves.toEqual(
      { kind: 'verify', closed: [9, 12] },
    );
    expect(issues.findOpen).toHaveBeenCalledWith(
      'Production backup verification failed',
    );
    expect(issues.close).toHaveBeenCalledWith(
      9,
      `Resolved: a later run succeeded: ${RUN_URL}`,
    );
    expect(issues.close).toHaveBeenCalledWith(
      12,
      `Resolved: a later run succeeded: ${RUN_URL}`,
    );
  });

  it('does nothing when no issue of the kind is open', async () => {
    issues.findOpen.mockResolvedValue([]);

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).resolves.toEqual(
      { kind: 'verify', closed: [] },
    );
    expect(issues.close).not.toHaveBeenCalled();
  });

  it('surfaces a failing close', async () => {
    issues.findOpen.mockResolvedValue([{ number: 9, title: KIND.title }]);
    issues.close.mockRejectedValue(new Error('gh issue close failed'));

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).rejects.toThrow(
      'gh issue close failed',
    );
  });
});

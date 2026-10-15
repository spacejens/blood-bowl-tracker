import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupAlertIssuesService } from './backup-alert-issues.service';
import { BackupAlertKind } from './backup-alert-kinds';
import { RaiseAlertService } from './raise-alert.service';

const KIND: BackupAlertKind = {
  id: 'backup',
  title: 'Production backup failed',
  failure: 'The backup failed.',
};
const RUN_URL =
  'https://github.com/spacejens/blood-bowl-tracker/actions/runs/123';
const ISSUE_URL = 'https://github.com/spacejens/blood-bowl-tracker/issues/77';

describe('RaiseAlertService', () => {
  let service: RaiseAlertService;
  let issues: MockProxy<BackupAlertIssuesService>;

  beforeEach(async () => {
    issues = mock<BackupAlertIssuesService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RaiseAlertService,
        { provide: BackupAlertIssuesService, useValue: issues },
      ],
    }).compile();
    service = moduleRef.get(RaiseAlertService);
  });

  it('opens a labeled issue linking the run when none is open', async () => {
    issues.findOpen.mockResolvedValue([]);
    issues.create.mockResolvedValue(ISSUE_URL);

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).resolves.toEqual(
      { kind: 'backup', action: 'created', issueUrl: ISSUE_URL },
    );
    expect(issues.findOpen).toHaveBeenCalledWith('Production backup failed');
    expect(issues.ensureLabel).toHaveBeenCalledTimes(1);
    expect(issues.create).toHaveBeenCalledTimes(1);
    const created = issues.create.mock.calls[0][0];
    expect(created.title).toBe('Production backup failed');
    expect(created.body).toContain('The backup failed.');
    expect(created.body).toContain(RUN_URL);
    expect(created.body).toContain(
      'docs/discord-bot/production-backups.md#alerts',
    );
    expect(issues.comment).not.toHaveBeenCalled();
  });

  it('comments on the oldest open issue instead of opening another', async () => {
    issues.findOpen.mockResolvedValue([
      { number: 9, title: KIND.title },
      { number: 12, title: KIND.title },
    ]);

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).resolves.toEqual(
      { kind: 'backup', action: 'commented', issueNumber: 9 },
    );
    expect(issues.comment).toHaveBeenCalledWith(9, `Failed again: ${RUN_URL}`);
    expect(issues.ensureLabel).not.toHaveBeenCalled();
    expect(issues.create).not.toHaveBeenCalled();
  });

  it('creates nothing when the lookup fails', async () => {
    issues.findOpen.mockRejectedValue(new Error('gh issue list failed'));

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).rejects.toThrow(
      'gh issue list failed',
    );
    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.comment).not.toHaveBeenCalled();
  });

  it('surfaces a failing create', async () => {
    issues.findOpen.mockResolvedValue([]);
    issues.create.mockRejectedValue(new Error('gh issue create failed'));

    await expect(service.run({ kind: KIND, runUrl: RUN_URL })).rejects.toThrow(
      'gh issue create failed',
    );
  });
});

import type { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ErrorLogService } from './error-log.service';

describe('ErrorLogService', () => {
  let service: ErrorLogService;
  let logger: MockProxy<Logger>;

  beforeEach(async () => {
    logger = mock<Logger>();
    const moduleRef = await Test.createTestingModule({
      providers: [ErrorLogService],
    }).compile();
    service = moduleRef.get(ErrorLogService);
  });

  it('logs the summary with the stack of an Error that has one', () => {
    const error = new Error('database down');

    service.logError(logger, 'Import failed', error);

    expect(logger.error.mock.calls).toEqual([['Import failed', error.stack]]);
  });

  it('appends the message of an Error without a stack to the summary', () => {
    const error = new Error('database down');
    error.stack = undefined;

    service.logError(logger, 'Import failed', error);

    expect(logger.error.mock.calls).toEqual([['Import failed: database down']]);
  });

  it('appends an Error stack without frames to the summary', () => {
    const error = new Error('failed');
    error.stack = 'CustomError: failed';

    service.logError(logger, 'Import failed', error);

    expect(logger.error.mock.calls).toEqual([
      ['Import failed: CustomError: failed'],
    ]);
  });

  it('appends a thrown string to the summary', () => {
    service.logError(logger, 'Import failed', 'boom');

    expect(logger.error.mock.calls).toEqual([['Import failed: boom']]);
  });

  it('appends any other thrown value, stringified, to the summary', () => {
    service.logError(logger, 'Import failed', 42);

    expect(logger.error.mock.calls).toEqual([['Import failed: 42']]);
  });
});

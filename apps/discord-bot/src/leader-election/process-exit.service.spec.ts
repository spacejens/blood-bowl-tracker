import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessExitService } from './process-exit.service';

describe('ProcessExitService', () => {
  let service: ProcessExitService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ProcessExitService],
    }).compile();
    service = moduleRef.get(ProcessExitService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits the process with the given code', () => {
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    service.exit(1);

    expect(exit).toHaveBeenCalledWith(1);
  });
});

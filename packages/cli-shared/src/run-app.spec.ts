import { INestApplicationContext } from '@nestjs/common';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runApp } from './run-app';

type CreateApplicationContext = (
  module: unknown,
  options: unknown,
) => Promise<INestApplicationContext>;

// NestFactory.createApplicationContext is replaced by a wrapper delegating to
// the current test's mock, installed fresh in beforeEach.
const nest = vi.hoisted(() => {
  const state: { current?: Mock<CreateApplicationContext> } = {};
  return {
    state,
    get: (): Mock<CreateApplicationContext> => {
      if (!state.current) {
        throw new Error(
          'createApplicationContext mock was not installed for this test',
        );
      }
      return state.current;
    },
  };
});

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: (
      module: unknown,
      options: unknown,
    ): Promise<INestApplicationContext> => nest.get()(module, options),
  },
}));

class TestModule {}

interface TestOutcome {
  readonly value: string;
}

const OUTCOME: TestOutcome = { value: 'done' };

describe('runApp', () => {
  let createApplicationContext: Mock<CreateApplicationContext>;
  let close: ReturnType<typeof vi.fn>;
  let app: INestApplicationContext;
  let errorLog: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    close = vi.fn().mockResolvedValue(undefined);
    app = { close } as unknown as INestApplicationContext;
    createApplicationContext = vi
      .fn<CreateApplicationContext>()
      .mockResolvedValue(app);
    nest.state.current = createApplicationContext;
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    nest.state.current = undefined;
    // Only undoes the console/process spies (vi.spyOn on real globals).
    vi.restoreAllMocks();
  });

  it('boots the module with logging off, runs against the context, closes it, then hands over the outcome', async () => {
    const run = vi
      .fn<(ctx: INestApplicationContext) => Promise<TestOutcome>>()
      .mockResolvedValue(OUTCOME);
    const onOutcome = vi
      .fn<(outcome: TestOutcome) => number | undefined>()
      .mockImplementation(() => {
        // The context is already closed by the time the outcome is printed.
        expect(close).toHaveBeenCalledTimes(1);
        return undefined;
      });

    await runApp({ module: TestModule, run, onOutcome, failureLabel: 'Boom:' });

    // abortOnError: false makes an initialization failure reject, so it reaches
    // the failure label instead of Nest exiting silently.
    expect(createApplicationContext).toHaveBeenCalledWith(TestModule, {
      logger: false,
      abortOnError: false,
    });
    expect(run).toHaveBeenCalledWith(app);
    expect(onOutcome).toHaveBeenCalledWith(OUTCOME);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('does not exit when onOutcome returns 0 and exitOnSuccess is unset', async () => {
    await runApp({
      module: TestModule,
      run: vi.fn().mockResolvedValue(OUTCOME),
      onOutcome: () => 0,
      failureLabel: 'Boom:',
    });

    expect(exit).not.toHaveBeenCalled();
  });

  it('exits explicitly with 0 on success when exitOnSuccess is set', async () => {
    await runApp({
      module: TestModule,
      run: vi.fn().mockResolvedValue(OUTCOME),
      onOutcome: () => undefined,
      failureLabel: 'Boom:',
      exitOnSuccess: true,
    });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits with the non-zero code onOutcome returns', async () => {
    await runApp({
      module: TestModule,
      run: vi.fn().mockResolvedValue(OUTCOME),
      onOutcome: () => 2,
      failureLabel: 'Boom:',
    });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(2);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('exits with the non-zero code onOutcome returns even when exitOnSuccess is set', async () => {
    await runApp({
      module: TestModule,
      run: vi.fn().mockResolvedValue(OUTCOME),
      onOutcome: () => 3,
      failureLabel: 'Boom:',
      exitOnSuccess: true,
    });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(3);
  });

  it('closes the context, prints the label with the error and exits 1 when run throws', async () => {
    const error = new Error('run failed');
    const onOutcome = vi.fn<(outcome: TestOutcome) => number | undefined>();

    await runApp({
      module: TestModule,
      run: vi.fn().mockRejectedValue(error),
      onOutcome,
      failureLabel: 'Review failed:',
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith('Review failed:', error);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it('prints the label and exits 1 without closing when the context cannot be created', async () => {
    const error = new Error('no context');
    createApplicationContext.mockRejectedValue(error);
    const run = vi.fn();

    await runApp({
      module: TestModule,
      run,
      onOutcome: () => undefined,
      failureLabel: 'Import failed:',
    });

    expect(run).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith('Import failed:', error);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('treats a failure to close the context as a failed run', async () => {
    const error = new Error('close failed');
    close.mockRejectedValue(error);
    const onOutcome = vi.fn<(outcome: TestOutcome) => number | undefined>();

    await runApp({
      module: TestModule,
      run: vi.fn().mockResolvedValue(OUTCOME),
      onOutcome,
      failureLabel: 'Import failed:',
      exitOnSuccess: true,
    });

    expect(onOutcome).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith('Import failed:', error);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('treats an onOutcome that throws as a failed run', async () => {
    const error = new Error('print failed');

    await runApp({
      module: TestModule,
      run: vi.fn().mockResolvedValue(OUTCOME),
      onOutcome: () => {
        throw error;
      },
      failureLabel: 'Review failed:',
      exitOnSuccess: true,
    });

    expect(errorLog).toHaveBeenCalledWith('Review failed:', error);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

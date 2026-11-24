import type { INestApplicationContext } from '@nestjs/common';
import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewOutcome } from './review-base.service';
import { runReviewCli } from './run-review-cli';

/** The runApp options runReviewCli builds, as this spec inspects them. */
interface CapturedRunAppOptions {
  readonly module: unknown;
  readonly run: (app: INestApplicationContext) => Promise<ReviewOutcome>;
  readonly onOutcome: (outcome: ReviewOutcome) => number | undefined;
  readonly failureLabel: string;
  readonly exitOnSuccess?: boolean;
}

type RunApp = (options: CapturedRunAppOptions) => Promise<void>;

// cli-shared's runApp is replaced by a wrapper delegating to the current
// test's mock, installed fresh in beforeEach.
const cliShared = vi.hoisted(() => {
  const state: { current?: Mock<RunApp> } = {};
  return {
    state,
    get: (): Mock<RunApp> => {
      if (!state.current) {
        throw new Error('runApp mock was not installed for this test');
      }
      return state.current;
    },
  };
});

vi.mock('@blood-bowl-tracker/cli-shared', () => ({
  runApp: (options: CapturedRunAppOptions): Promise<void> =>
    cliShared.get()(options),
}));

class TestAppModule {}

class StubReviewRunner {
  run(): Promise<ReviewOutcome> {
    return Promise.reject(new Error('not used: the context mock answers'));
  }
}

const OUTCOME: ReviewOutcome = {
  reportPath: '/tmp/report.html',
  itemCount: 7,
  gaps: [
    { source: 'bbl', reason: 'no BBL match in range' },
    { source: 'tp', reason: 'no TP files' },
  ],
};

describe('runReviewCli', () => {
  let runApp: Mock<RunApp>;
  let log: MockInstance<typeof console.log>;
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    runApp = vi.fn<RunApp>().mockResolvedValue(undefined);
    cliShared.state.current = runApp;
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cliShared.state.current = undefined;
    vi.restoreAllMocks();
  });

  const start = async (): Promise<CapturedRunAppOptions> => {
    await runReviewCli({
      module: TestAppModule,
      reviewService: StubReviewRunner,
      itemLabel: 'match(es)',
    });
    expect(runApp).toHaveBeenCalledTimes(1);
    return runApp.mock.calls[0][0];
  };

  it('runs the module with the review failure label and an explicit exit on success', async () => {
    const options = await start();

    expect(options.module).toBe(TestAppModule);
    expect(options.failureLabel).toBe('Review failed:');
    expect(options.exitOnSuccess).toBe(true);
  });

  it("runs the tool's review service from the context and returns its outcome", async () => {
    const options = await start();
    const run = vi.fn().mockResolvedValue(OUTCOME);
    const get = vi.fn().mockReturnValue({ run });
    const app = { get } as unknown as INestApplicationContext;

    await expect(options.run(app)).resolves.toBe(OUTCOME);
    expect(get).toHaveBeenCalledWith(StubReviewRunner);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('prints every gap as a warning, then the summary line, and reports success', async () => {
    const options = await start();

    expect(options.onOutcome(OUTCOME)).toBeUndefined();

    expect(warn.mock.calls).toEqual([
      ['Warning [BBL]: no BBL match in range'],
      ['Warning [TP]: no TP files'],
    ]);
    expect(log).toHaveBeenCalledWith(
      'Reviewed 7 match(es); report written to /tmp/report.html.',
    );
  });

  it('prints no warnings when the run had no gaps', async () => {
    const options = await start();

    options.onOutcome({ ...OUTCOME, gaps: [] });

    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

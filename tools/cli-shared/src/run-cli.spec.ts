import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCli } from './run-cli';

vi.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: vi.fn() },
}));

const createApplicationContext = vi.mocked(
  NestFactory.createApplicationContext,
);

const SUBCOMMANDS = ['alpha', 'beta'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

interface TestArgs {
  readonly value: string;
}

class TestModule {}

describe('runCli', () => {
  let close: ReturnType<typeof vi.fn>;
  let app: INestApplicationContext;
  let log: ReturnType<typeof vi.spyOn>;
  let errorLog: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    close = vi.fn().mockResolvedValue(undefined);
    app = { close } as unknown as INestApplicationContext;
    createApplicationContext.mockResolvedValue(app);
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const argvFor = (...rest: string[]): string[] => [
    'node',
    'dist/main.js',
    ...rest,
  ];

  it('reports a usage error for a missing subcommand without creating an app', async () => {
    const readArgs = vi.fn<(subcommand: Subcommand) => TestArgs>();
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await runCli({
      argv: argvFor(),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs,
      dispatch,
    });

    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Usage: node dist/main.js <alpha|beta>' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(readArgs).not.toHaveBeenCalled();
    expect(createApplicationContext).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('omits the "got" suffix for an empty subcommand', async () => {
    await runCli({
      argv: argvFor(''),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi.fn<(subcommand: Subcommand) => TestArgs>(),
      dispatch: vi.fn().mockResolvedValue(undefined),
    });

    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Usage: node dist/main.js <alpha|beta>' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('names the offending value for an unknown subcommand', async () => {
    await runCli({
      argv: argvFor('gamma'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi.fn<(subcommand: Subcommand) => TestArgs>(),
      dispatch: vi.fn().mockResolvedValue(undefined),
    });

    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({
        error: "Usage: node dist/main.js <alpha|beta> (got 'gamma')",
      }),
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(createApplicationContext).not.toHaveBeenCalled();
  });

  it('reads args before creating the Nest application context', async () => {
    // Ordering matters: readArgs reads stdin synchronously and must finish
    // before the Nest context is bootstrapped.
    const readArgs = vi
      .fn<(subcommand: Subcommand) => TestArgs>()
      .mockReturnValue({ value: 'from-stdin' });

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs,
      dispatch: vi.fn().mockResolvedValue(undefined),
    });

    expect(readArgs).toHaveBeenCalledWith('alpha');
    expect(readArgs.mock.invocationCallOrder[0]).toBeLessThan(
      createApplicationContext.mock.invocationCallOrder[0],
    );
    expect(createApplicationContext).toHaveBeenCalledWith(TestModule, {
      logger: false,
    });
  });

  it('closes the app and prints the pretty-printed dispatch result', async () => {
    const args: TestArgs = { value: 'from-stdin' };
    const dispatch = vi.fn().mockResolvedValue({ ok: true, count: 2 });

    await runCli({
      argv: argvFor('beta'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue(args),
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith(app, 'beta', args);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ ok: true, count: 2 }, null, 2),
    );
    expect(errorLog).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('closes the app and reports the message when dispatch throws an Error', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('dispatch blew up'));

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue({ value: 'x' }),
      dispatch,
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'dispatch blew up' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error value thrown by dispatch', async () => {
    const dispatch = vi.fn().mockRejectedValue('plain string failure');

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue({ value: 'x' }),
      dispatch,
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'plain string failure' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports a readArgs failure without ever creating an app', async () => {
    const readArgs = vi
      .fn<(subcommand: Subcommand) => TestArgs>()
      .mockImplementation(() => {
        throw new Error('Usage: node dist/main.js alpha <thing>');
      });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs,
      dispatch,
    });

    expect(createApplicationContext).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Usage: node dist/main.js alpha <thing>' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports a Nest bootstrap failure without dispatching or closing an app', async () => {
    createApplicationContext.mockRejectedValue(new Error('bootstrap blew up'));
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue({ value: 'x' }),
      dispatch,
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'bootstrap blew up' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports the error when app.close() rejects, suppressing success output', async () => {
    close.mockRejectedValue(new Error('close blew up'));
    const dispatch = vi.fn().mockResolvedValue({ ok: true });

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue({ value: 'x' }),
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'close blew up', dispatchSucceeded: true }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('calls onCleanupFailureAfterDispatch with the result, subcommand and args when app.close() rejects', async () => {
    close.mockRejectedValue(new Error('close blew up'));
    const args: TestArgs = { value: 'x' };
    const dispatch = vi.fn().mockResolvedValue({ acquired: true });
    const onCleanupFailureAfterDispatch = vi.fn().mockResolvedValue(undefined);

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue(args),
      dispatch,
      onCleanupFailureAfterDispatch,
    });

    expect(onCleanupFailureAfterDispatch).toHaveBeenCalledWith(
      { acquired: true },
      'alpha',
      args,
    );
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'close blew up', dispatchSucceeded: true }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports the original error unchanged when onCleanupFailureAfterDispatch itself rejects', async () => {
    close.mockRejectedValue(new Error('close blew up'));
    const onCleanupFailureAfterDispatch = vi
      .fn()
      .mockRejectedValue(new Error('cleanup blew up too'));

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue({ value: 'x' }),
      dispatch: vi.fn().mockResolvedValue({ acquired: true }),
      onCleanupFailureAfterDispatch,
    });

    expect(onCleanupFailureAfterDispatch).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'close blew up', dispatchSucceeded: true }),
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('skips the cleanup hook and the dispatchSucceeded flag when dispatch itself throws', async () => {
    const onCleanupFailureAfterDispatch = vi.fn().mockResolvedValue(undefined);

    await runCli({
      argv: argvFor('alpha'),
      subcommands: SUBCOMMANDS,
      module: TestModule,
      readArgs: vi
        .fn<(subcommand: Subcommand) => TestArgs>()
        .mockReturnValue({ value: 'x' }),
      dispatch: vi.fn().mockRejectedValue(new Error('dispatch blew up')),
      onCleanupFailureAfterDispatch,
    });

    expect(onCleanupFailureAfterDispatch).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({ error: 'dispatch blew up' }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

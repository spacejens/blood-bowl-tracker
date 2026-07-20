import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ManualDataReader } from '../data-file/manual-data-reader.service';
import type { ExternalSystemsProcessor } from '../entities/external-systems.processor';
import type { ProcessContext } from '../references/process-context';
import { ManualImportService } from './manual-import.service';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    coaches: [],
    teams: [],
  };
}

function makeService(overrides: {
  read?: () => Promise<ManualDataFile>;
  bootstrap?: () => Promise<Map<string, number>>;
  counts?: Partial<Record<string, number>>;
  errorFrom?: { processor: string; message: string };
}) {
  const reader = {
    read: vi.fn(overrides.read ?? (() => Promise.resolve(emptyData()))),
  } as unknown as ManualDataReader;
  const externalSystems = {
    bootstrap: vi.fn(overrides.bootstrap ?? (() => Promise.resolve(new Map()))),
  } as unknown as ExternalSystemsProcessor;

  const makeProc = (name: string) => ({
    process: vi.fn((ctx: ProcessContext) => {
      if (overrides.errorFrom?.processor === name) {
        ctx.errors.push({ item: {}, message: overrides.errorFrom.message });
      }
      return Promise.resolve(overrides.counts?.[name] ?? 0);
    }),
  });

  const procs = {
    rulesSets: makeProc('rulesSets'),
    leagues: makeProc('leagues'),
    eras: makeProc('eras'),
    races: makeProc('races'),
    positions: makeProc('positions'),
    coaches: makeProc('coaches'),
    teams: makeProc('teams'),
  };

  const service = new ManualImportService(
    reader,
    externalSystems,
    procs.rulesSets as never,
    procs.leagues as never,
    procs.eras as never,
    procs.races as never,
    procs.positions as never,
    procs.coaches as never,
    procs.teams as never,
  );
  return { service, reader, externalSystems, procs };
}

describe('ManualImportService', () => {
  it('sums processor counts and reports success when there are no errors', async () => {
    const { service } = makeService({
      counts: {
        rulesSets: 1,
        leagues: 1,
        eras: 2,
        races: 1,
        coaches: 1,
        teams: 1,
      },
    });

    const result = await service.run('/data/dir');

    expect(result.imported).toBe(7);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reads the directory, bootstraps, and shares one context/id-map across processors', async () => {
    const { service, reader, externalSystems, procs } = makeService({});

    await service.run('/data/dir');

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(reader.read).toHaveBeenCalledWith('/data/dir');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(externalSystems.bootstrap).toHaveBeenCalledTimes(1);
    const rulesCtx = procs.rulesSets.process.mock.calls[0][0];
    const teamsCtx = procs.teams.process.mock.calls[0][0];
    expect(teamsCtx.idMap).toBe(rulesCtx.idMap);
    expect(teamsCtx.errors).toBe(rulesCtx.errors);
  });

  it('runs processors in dependency order', async () => {
    const order: string[] = [];
    const { service, procs } = makeService({});
    for (const [name, proc] of Object.entries(procs)) {
      proc.process.mockImplementation(() => {
        order.push(name);
        return Promise.resolve(0);
      });
    }

    await service.run('/data/dir');

    expect(order).toEqual([
      'rulesSets',
      'leagues',
      'eras',
      'races',
      'positions',
      'coaches',
      'teams',
    ]);
  });

  it('reports failure when a processor collected an error', async () => {
    const { service } = makeService({
      counts: { rulesSets: 1 },
      errorFrom: { processor: 'eras', message: 'unresolved league' },
    });

    const result = await service.run('/data/dir');

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ item: {}, message: 'unresolved league' }]);
  });

  it('propagates a bootstrap failure (thrown, not collected)', async () => {
    const { service } = makeService({
      bootstrap: () => Promise.reject(new Error('api down')),
    });

    await expect(service.run('/data/dir')).rejects.toThrow('api down');
  });
});

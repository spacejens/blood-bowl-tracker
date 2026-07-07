import { describe, it, expect, vi } from 'vitest';
import type {
  CoachesImportService,
  ExternalSystemsImportService,
} from '@blood-bowl-tracker/import';
import { BblCoachesImportService } from './bbl-coaches-import.service';
import type { BblExport } from './bbl-types';

const bblData: BblExport = {
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachId: 'c1' }],
  players: [],
  matches: [],
  coaches: [{ id: 'c1', name: 'Gruk' }],
};

function makeService(
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertCoach: ReturnType<typeof vi.fn>,
) {
  return new BblCoachesImportService(
    { upsertCoach } as unknown as CoachesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
  );
}

describe('BblCoachesImportService', () => {
  it('upserts the BBL external system once', async () => {
    const upsertExternalSystem = vi.fn().mockResolvedValue(1);
    const upsertCoach = vi.fn().mockResolvedValue(true);
    const service = makeService(upsertExternalSystem, upsertCoach);

    await service.importBblData(bblData);

    expect(upsertExternalSystem).toHaveBeenCalledTimes(1);
    expect(upsertExternalSystem).toHaveBeenCalledWith('BBL');
  });

  it('upserts each coach with id: and name: external IDs', async () => {
    const upsertExternalSystem = vi.fn().mockResolvedValue(1);
    const upsertCoach = vi.fn().mockResolvedValue(true);
    const service = makeService(upsertExternalSystem, upsertCoach);

    await service.importBblData(bblData);

    expect(upsertCoach).toHaveBeenCalledTimes(1);
    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Gruk',
        externalIds: [
          { externalSystemId: 1, externalId: 'id:c1' },
          { externalSystemId: 1, externalId: 'name:gruk' },
        ],
      },
      expect.any(Array),
    );
  });

  it('reports a coach as an error when the upsert call fails', async () => {
    const upsertExternalSystem = vi.fn().mockResolvedValue(1);
    const upsertCoach = vi
      .fn()
      .mockImplementation(
        (_data: unknown, errors: { item: unknown; message: string }[]) => {
          errors.push({
            item: {},
            message: 'Failed to import coach "Gruk": conflict',
          });
          return Promise.resolve(false);
        },
      );
    const service = makeService(upsertExternalSystem, upsertCoach);

    const result = await service.importBblData(bblData);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Gruk'))).toBe(true);
  });

  it('reports one error and skips coach upserts when the external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to upsert external system "BBL": internal error'),
      );
    const upsertCoach = vi.fn();
    const service = makeService(upsertExternalSystem, upsertCoach);

    const result = await service.importBblData(bblData);

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('reports an error for each team pending race ID resolution', async () => {
    const upsertExternalSystem = vi.fn().mockResolvedValue(1);
    const upsertCoach = vi.fn().mockResolvedValue(true);
    const service = makeService(upsertExternalSystem, upsertCoach);

    const result = await service.importBblData(bblData);

    expect(result.errors.some((e) => e.message.includes('Green Mashers'))).toBe(
      true,
    );
  });
});

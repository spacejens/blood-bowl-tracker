import type {
  CoachesImportService,
  ExternalSystemsImportService,
} from '@blood-bowl-tracker/import';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import { TpCoachesImportService } from './tp-coaches-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  upsertExternalSystem: ReturnType<typeof vi.fn>;
  upsertCoach: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  files,
  upsertExternalSystem,
  upsertCoach,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpCoachesImportService(
    { files } as unknown as TpSourceReader,
    new InscriptionsParserService(),
    { upsertCoach } as unknown as CoachesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

function makeFiles(entries: TpSourceFile[]): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
  };
}

/** Models files() throwing partway through (e.g. a missing era directory). */
function makeFilesThatThrow(
  entries: TpSourceFile[],
  error: Error,
): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
    throw error;
  };
}

interface InscriptionPlayer {
  id: string;
  userNameToShow: string;
  nafNumber?: number;
}

function inscriptionsFile(
  era: string,
  competition: string,
  players: InscriptionPlayer[],
): TpSourceFile {
  return {
    era,
    competition,
    type: 'inscriptions',
    filename: `inscriptions_${competition}_inscriptions.json`,
    content: { '1': players.map((player) => ({ player })) },
  };
}

/** The upsertCoach result record; only `id` is read by the importer. */
function coachRecord(id: number) {
  return { id, name: 'X', createdAt: new Date(), created: true };
}

/** Two systems is not enough — coaches use three (TP, Name, NAF). */
function makeThreeSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(3);
}

describe('TpCoachesImportService', () => {
  it('upserts the TP, Name and NAF external systems in order', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', userNameToShow: 'Alice', nafNumber: 1 },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    await service.importCoaches();

    expect(upsertExternalSystem).toHaveBeenCalledTimes(3);
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'TP');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(3, 'NAF');
  });

  it('gives a coach with a nafNumber three external ids', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'guid-a', userNameToShow: 'Alice ', nafNumber: 19767 },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result, coachIdsByTpId } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Alice',
        externalIds: [
          { externalSystemId: 1, externalId: 'guid-a' },
          { externalSystemId: 2, externalId: 'Alice' },
          { externalSystemId: 3, externalId: '19767' },
        ],
      },
      expect.any(Array),
    );
    expect(coachIdsByTpId.get('guid-a')).toBe(10);
  });

  it('gives a coach without a nafNumber only two external ids', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'guid-b', userNameToShow: 'Bob' },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Bob',
        externalIds: [
          { externalSystemId: 1, externalId: 'guid-b' },
          { externalSystemId: 2, externalId: 'Bob' },
        ],
      },
      expect.any(Array),
    );
  });

  it('dedupes a coach appearing across multiple competitions and eras', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'dup', userNameToShow: 'Alice', nafNumber: 1 },
        ]),
        inscriptionsFile('Fifth era', 'blood-bowl-9', [
          { id: 'dup', userNameToShow: 'Alice', nafNumber: 1 },
          { id: 'other', userNameToShow: 'Bob' },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result } = await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('records a parse error for one bad inscriptions file but imports the rest', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'inscriptions',
          filename: 'inscriptions_chaos-cup-8_inscriptions.json',
          content: { '1': [{ player: { userNameToShow: 'No Id' } }] }, // missing id
        },
        inscriptionsFile('Fourth era', 'blood-bowl-9', [
          { id: 'good', userNameToShow: 'Alice' },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) =>
        e.message.includes('inscriptions_chaos-cup-8_inscriptions.json'),
      ),
    ).toBe(true);
  });

  it('ignores non-inscriptions files', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'tournament',
          filename: 'tournament_chaos-cup-8.json',
          content: { id: 1, name: 'X', ruleSet: 20 },
        },
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'awards',
          filename: 'awards_chaos-cup-8_awards.json',
          content: { '1': [] },
        },
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'good', userNameToShow: 'Alice' },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result } = await service.importCoaches();

    expect(upsertCoach).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(new Error('network timeout'));
    const upsertCoach = vi.fn();
    const service = makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', userNameToShow: 'Alice' },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({
      externalSystems: ['TP', 'Name', 'NAF'],
    });
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  it('records a diagnostic error but keeps coaches found before a scan failure', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
    const service = makeService({
      files: makeFilesThatThrow(
        [
          inscriptionsFile('Fourth era', 'chaos-cup-8', [
            { id: 'a', userNameToShow: 'Alice' },
          ]),
        ],
        new Error(
          'Era data directory not found: /data/fifth-era (configured for era "Fifth era").',
        ),
      ),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) =>
        e.message.includes('Era data directory not found'),
      ),
    ).toBe(true);
  });

  it('records an error and continues when a coach upsert fails', async () => {
    const upsertExternalSystem = makeThreeSystemUpsertMock();
    const upsertCoach = vi
      .fn()
      .mockImplementationOnce(
        (_data: unknown, errors: { message: string }[]) => {
          errors.push({ message: 'Failed to import coach "Alice"' });
          return Promise.resolve(undefined);
        },
      )
      .mockResolvedValue(coachRecord(11));
    const service = makeService({
      files: makeFiles([
        inscriptionsFile('Fourth era', 'chaos-cup-8', [
          { id: 'a', userNameToShow: 'Alice' },
          { id: 'b', userNameToShow: 'Bob' },
        ]),
      ]),
      upsertExternalSystem,
      upsertCoach,
    });

    const { result, coachIdsByTpId } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(coachIdsByTpId.has('a')).toBe(false);
    expect(coachIdsByTpId.get('b')).toBe(11);
  });

  it('re-runs idempotently, upserting the same coach with identical data', async () => {
    const makeRun = () => {
      const upsertExternalSystem = makeThreeSystemUpsertMock();
      const upsertCoach = vi.fn().mockResolvedValue(coachRecord(10));
      const service = makeService({
        files: makeFiles([
          inscriptionsFile('Fourth era', 'chaos-cup-8', [
            { id: 'a', userNameToShow: 'Alice', nafNumber: 1 },
          ]),
        ]),
        upsertExternalSystem,
        upsertCoach,
      });
      return { service, upsertCoach };
    };

    const first = makeRun();
    const firstResult = await first.service.importCoaches();
    const second = makeRun();
    const secondResult = await second.service.importCoaches();

    expect(firstResult.result.imported).toBe(1);
    expect(secondResult.result.imported).toBe(1);
    expect(first.upsertCoach.mock.calls[0][0]).toEqual(
      second.upsertCoach.mock.calls[0][0],
    );
  });
});

import type {
  ExternalSystemsImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblPositionsImportService } from './bbl-positions-import.service';
import type { BblPosition } from './position-page-parser';
import { PositionPageParser } from './position-page-parser';

/** A fake pt page carrying its parsed position in params for the stub parser. */
function page(position: BblPosition | null): BblPage {
  return {
    type: 'pt',
    params: { position: JSON.stringify(position) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeReader(pages: BblPage[]): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages() {
      for (const p of pages) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function makeParser(): PositionPageParser {
  const parser = new PositionPageParser();
  vi.spyOn(parser, 'extractPosition').mockImplementation(
    (p) => JSON.parse(p.params.position) as BblPosition | null,
  );
  return parser;
}

function makeService(
  reader: BblSourceReader,
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertPosition: ReturnType<typeof vi.fn>,
  getBblSystemName: () => string = () => 'BBL',
) {
  return new BblPositionsImportService(
    reader,
    makeParser(),
    { upsertPosition } as unknown as PositionsImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

const raceMap = new Map<string, number>([
  ['48', 480],
  ['7', 70],
]);

describe('BblPositionsImportService', () => {
  it('upserts one position per resolvable race with composite external IDs', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([
        page({
          typId: '33',
          name: 'Goblin Linemen',
          races: [
            { bblId: '48', name: 'College of Shadow' },
            { bblId: '7', name: 'Goblin Team' },
          ],
        }),
      ]),
      upsertExternalSystem,
      upsertPosition,
    );

    const result = await service.importPositions(raceMap);

    expect(result.imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        raceId: 480,
        externalIds: [
          { externalSystemId: 1, externalId: '33-48' },
          {
            externalSystemId: 2,
            externalId: 'College of Shadow: Goblin Linemen',
          },
        ],
      },
      expect.any(Array),
    );
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        raceId: 70,
        externalIds: [
          { externalSystemId: 1, externalId: '33-7' },
          { externalSystemId: 2, externalId: 'Goblin Team: Goblin Linemen' },
        ],
      },
      expect.any(Array),
    );
  });

  it('skips a position with zero races and records an error', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([
        { ...page({ typId: '121', name: 'Norse Catchers', races: [] }) },
      ]),
      upsertExternalSystem,
      upsertPosition,
    );

    const result = await service.importPositions(raceMap);

    expect(result.imported).toBe(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('Norse Catchers')),
    ).toBe(true);
  });

  it('skips one pairing when its race is not in the map but imports the others', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([
        page({
          typId: '33',
          name: 'Goblin Linemen',
          races: [
            { bblId: '48', name: 'College of Shadow' },
            { bblId: '999', name: 'Unknown Race' },
          ],
        }),
      ]),
      upsertExternalSystem,
      upsertPosition,
    );

    const result = await service.importPositions(raceMap);

    expect(result.imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(result.errors.some((e) => e.message.includes('Unknown Race'))).toBe(
      true,
    );
  });

  it('skips pages the parser returns null for', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader([page(null)]),
      upsertExternalSystem,
      upsertPosition,
    );

    const result = await service.importPositions(raceMap);

    expect(result.imported).toBe(0);
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('records an error and continues when a page throws while parsing', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const parser = new PositionPageParser();
    vi.spyOn(parser, 'extractPosition')
      .mockImplementationOnce(() => {
        throw new Error('bad page');
      })
      .mockImplementationOnce(
        (p) => JSON.parse(p.params.position) as BblPosition | null,
      );
    const service = new BblPositionsImportService(
      makeReader([
        page(null),
        page({
          typId: '10',
          name: 'Lineman',
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      parser,
      { upsertPosition } as unknown as PositionsImportService,
      { upsertExternalSystem } as unknown as ExternalSystemsImportService,
      {
        getBblSystemName: () => 'BBL',
      } as unknown as ExternalSystemNameConfigService,
    );

    const result = await service.importPositions(raceMap);

    expect(result.imported).toBe(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse position page'),
      ),
    ).toBe(true);
  });

  it('records one error and skips positions when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(
        new Error('Failed to upsert external system "BBL": internal error'),
      );
    const upsertPosition = vi.fn();
    const service = makeService(
      makeReader([
        page({
          typId: '10',
          name: 'Lineman',
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      upsertExternalSystem,
      upsertPosition,
    );

    const result = await service.importPositions(raceMap);

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertPosition).not.toHaveBeenCalled();
  });
});

import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { SkillMasterNameCollectionService } from './skill-master-name-collection.service';
import { TpSourceReader } from './tp-source-reader';

describe('SkillMasterNameCollectionService', () => {
  let service: SkillMasterNameCollectionService;
  let sourceReader: MockProxy<TpSourceReader>;
  let parser: MockProxy<SkillMasterNamesParserService>;
  let importResults: MockProxy<ImportResultService>;

  function file(filename: string, type: string) {
    return {
      era: 'third',
      competition: 'cup',
      type,
      filename,
      content: {},
    };
  }

  function seed(files: ReturnType<typeof file>[]) {
    sourceReader.filesOfType.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield* files;
      })(),
    );
  }

  beforeEach(async () => {
    sourceReader = mock<TpSourceReader>();
    parser = mock<SkillMasterNamesParserService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((error) => error);
    const moduleRef = await Test.createTestingModule({
      providers: [
        SkillMasterNameCollectionService,
        { provide: TpSourceReader, useValue: sourceReader },
        { provide: SkillMasterNamesParserService, useValue: parser },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(SkillMasterNameCollectionService);
  });

  it('merges the names found in every scanned file', async () => {
    seed([file('rosters_1.json', 'rosters'), file('match_2.json', 'match')]);
    // parser.extract is mocked, so it does not actually merge `into` itself
    // here -- each stubbed return simulates what the real parser would
    // return given the accumulator it was passed, which is what collect()
    // now threads through instead of merging results itself.
    parser.extract
      .mockReturnValueOnce(new Map([[87, { name: 'Dodge', isElite: false }]]))
      .mockReturnValueOnce(
        new Map([
          [87, { name: 'Dodge', isElite: false }],
          [120, { name: 'Block', isElite: false }],
        ]),
      );

    const errors: ImportError[] = [];
    const names = await service.collect(errors);

    expect(names).toEqual(
      new Map([
        [87, { name: 'Dodge', isElite: false }],
        [120, { name: 'Block', isElite: false }],
      ]),
    );
    expect(errors).toEqual([]);
    expect(parser.extract).toHaveBeenNthCalledWith(1, {}, new Map());
    expect(parser.extract).toHaveBeenNthCalledWith(
      2,
      {},
      new Map([[87, { name: 'Dodge', isElite: false }]]),
    );
  });

  it('scans only the rosters and match file types', async () => {
    seed([]);

    await service.collect([]);

    expect(sourceReader.filesOfType).toHaveBeenCalledWith(['rosters', 'match']);
  });

  it('records a per-file failure and keeps scanning', async () => {
    seed([
      file('rosters_1.json', 'rosters'),
      file('rosters_2.json', 'rosters'),
    ]);
    parser.extract
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockReturnValueOnce(new Map([[87, { name: 'Dodge', isElite: false }]]));

    const errors: ImportError[] = [];
    const names = await service.collect(errors);

    expect(names).toEqual(new Map([[87, { name: 'Dodge', isElite: false }]]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('rosters_1.json');
  });

  it('records a scan failure and returns what it collected', async () => {
    sourceReader.filesOfType.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield file('rosters_1.json', 'rosters');
        throw new Error('scan blew up');
      })(),
    );
    parser.extract.mockReturnValue(
      new Map([[87, { name: 'Dodge', isElite: false }]]),
    );

    const errors: ImportError[] = [];
    const names = await service.collect(errors);

    expect(names).toEqual(new Map([[87, { name: 'Dodge', isElite: false }]]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('scan blew up');
  });

  it('keeps a skill elite when only one scanned file marks it so', async () => {
    seed([file('rosters_1.json', 'rosters'), file('match_2.json', 'match')]);
    // Simulates the real parser's OR-accumulation: once the first file's
    // return is threaded back in as the second call's accumulator, the real
    // parser would keep isElite: true even though the second file's own
    // embedding is not elite.
    parser.extract
      .mockReturnValueOnce(new Map([[220, { name: 'Block', isElite: true }]]))
      .mockReturnValueOnce(new Map([[220, { name: 'Block', isElite: true }]]));

    const errors: ImportError[] = [];
    const masters = await service.collect(errors);

    expect(masters.get(220)).toEqual({ name: 'Block', isElite: true });
    expect(errors).toEqual([]);
  });
});

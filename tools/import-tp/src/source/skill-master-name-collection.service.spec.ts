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
    sourceReader.files.mockReturnValue(
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
    parser.extract
      .mockReturnValueOnce(new Map([[87, 'Dodge']]))
      .mockReturnValueOnce(new Map([[120, 'Block']]));

    const errors: ImportError[] = [];
    const names = await service.collect(errors);

    expect(names).toEqual(
      new Map([
        [87, 'Dodge'],
        [120, 'Block'],
      ]),
    );
    expect(errors).toEqual([]);
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
      .mockReturnValueOnce(new Map([[87, 'Dodge']]));

    const errors: ImportError[] = [];
    const names = await service.collect(errors);

    expect(names).toEqual(new Map([[87, 'Dodge']]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('rosters_1.json');
  });

  it('records a scan failure and returns what it collected', async () => {
    sourceReader.files.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield file('rosters_1.json', 'rosters');
        throw new Error('scan blew up');
      })(),
    );
    parser.extract.mockReturnValue(new Map([[87, 'Dodge']]));

    const errors: ImportError[] = [];
    const names = await service.collect(errors);

    expect(names).toEqual(new Map([[87, 'Dodge']]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('scan blew up');
  });
});

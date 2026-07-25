import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RosterCollectionService } from './roster-collection.service';
import type { TpSourceFile } from './tp-source-reader';
import { TpSourceReader } from './tp-source-reader';

/**
 * Canned TpRosters the mocked RosterParserService.parse returns, one per file
 * a test feeds in. RosterParserService's own Zod-backed field mapping and
 * validation are covered by its dedicated spec in packages/parse-tp;
 * RosterCollectionService only tags parse()'s return value with the era and
 * competition it was found under, so these values just need to be
 * distinguishable.
 */
const ORC_ROSTER: TpRoster = {
  id: 1,
  teamName: 'Team 1',
  teamRaceCode: 'Orc',
  raceName: 'Orc',
  coachTpId: 'coach-1',
  positions: [],
  starPositions: [],
  players: [],
};

const DWARF_ROSTER: TpRoster = {
  id: 2,
  teamName: 'Team 2',
  teamRaceCode: 'Dwarf',
  raceName: 'Dwarf',
  coachTpId: 'coach-1',
  positions: [],
  starPositions: [],
  players: [],
};

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
  error: unknown,
): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }

    throw error;
  };
}

function rosterFile(
  era: string,
  competition: string,
  opts: { id: number },
): TpSourceFile {
  return {
    era,
    competition,
    type: 'rosters',
    filename: `rosters_${opts.id}.json`,
    content: { rosterFile: opts.id },
  };
}

describe('RosterCollectionService', () => {
  let sourceReader: MockProxy<TpSourceReader>;
  let rosterParser: MockProxy<RosterParserService>;
  let importResults: MockProxy<ImportResultService>;
  let service: RosterCollectionService;

  beforeEach(async () => {
    sourceReader = mock<TpSourceReader>();
    rosterParser = mock<RosterParserService>();
    importResults = mock<ImportResultService>();
    // Recipe F: importResults.error() is a plain identity echo of the args
    // the service passes in — not a reimplementation of any collaborator
    // logic — so it is exempt from the "canned response" rule and stays a
    // passthrough mock.
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        RosterCollectionService,
        { provide: TpSourceReader, useValue: sourceReader },
        { provide: RosterParserService, useValue: rosterParser },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(RosterCollectionService);
  });

  describe('collect', () => {
    it('collects every rosters file, tagging each roster with its era', async () => {
      rosterParser.parse
        .mockReturnValueOnce(ORC_ROSTER)
        .mockReturnValueOnce(DWARF_ROSTER);
      sourceReader.files.mockImplementation(
        makeFiles([
          rosterFile('Fourth era', 'comp-a', { id: 1 }),
          rosterFile('Fifth era', 'comp-b', { id: 2 }),
        ]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(errors).toHaveLength(0);
      expect(rosters).toEqual([
        { roster: ORC_ROSTER, era: 'Fourth era', competition: 'comp-a' },
        { roster: DWARF_ROSTER, era: 'Fifth era', competition: 'comp-b' },
      ]);
      expect(rosterParser.parse).toHaveBeenNthCalledWith(1, { rosterFile: 1 });
      expect(rosterParser.parse).toHaveBeenNthCalledWith(2, { rosterFile: 2 });
    });

    it('ignores non-rosters files', async () => {
      rosterParser.parse.mockReturnValue(ORC_ROSTER);
      sourceReader.files.mockImplementation(
        makeFiles([
          {
            era: 'Fourth era',
            competition: 'comp',
            type: 'tournament',
            filename: 'tournament_comp.json',
            content: { id: 1, name: 'X', ruleSet: 20 },
          },
          rosterFile('Fourth era', 'comp', { id: 1 }),
        ]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toHaveLength(1);
      expect(rosterParser.parse).toHaveBeenCalledTimes(1);
    });

    it('records a parse error for one bad roster file but keeps the rest', async () => {
      rosterParser.parse
        .mockImplementationOnce(() => {
          throw new Error('rosterMaster is required');
        })
        .mockReturnValueOnce(ORC_ROSTER);
      sourceReader.files.mockImplementation(
        makeFiles([
          {
            era: 'Fourth era',
            competition: 'comp',
            type: 'rosters',
            filename: 'rosters_bad.json',
            content: { rosterFile: 'bad' },
          },
          rosterFile('Fourth era', 'comp', { id: 1 }),
        ]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toEqual([
        { roster: ORC_ROSTER, era: 'Fourth era', competition: 'comp' },
      ]);
      expect(errors.some((e) => e.message.includes('rosters_bad.json'))).toBe(
        true,
      );
    });

    it('records a parse error whose thrown value is not an Error instance', async () => {
      rosterParser.parse.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately models a non-Error throw for the instanceof-fallback branch
        throw 'a string error';
      });
      sourceReader.files.mockImplementation(
        makeFiles([rosterFile('Fourth era', 'comp', { id: 1 })]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('a string error');
    });

    it('records a diagnostic error but keeps rosters found before a scan failure', async () => {
      sourceReader.files.mockImplementation(
        makeFilesThatThrow(
          [rosterFile('Fourth era', 'comp', { id: 1 })],
          new Error(
            'Era data directory not found: /data/fifth-era (configured for era "Fifth era").',
          ),
        ),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toHaveLength(1);
      expect(
        errors.some((e) => e.message.includes('Era data directory not found')),
      ).toBe(true);
    });

    it('records a scan failure whose thrown value is not an Error instance', async () => {
      sourceReader.files.mockImplementation(
        makeFilesThatThrow([], 'a string error'),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('a string error');
    });
  });

  describe('unknownEraError', () => {
    it('builds an ImportError naming the era and roster id', () => {
      const error = service.unknownEraError('Ghost era', {
        id: 42,
        teamName: 'T',
        teamRaceCode: 'Orc',
        raceName: 'Orc',
        coachTpId: 'coach-1',
        positions: [],
        starPositions: [],
        players: [],
      });

      expect(error.item).toEqual({ era: 'Ghost era', roster: 42 });
      expect(error.message).toContain('Ghost era');
      expect(error.message).toContain('42');
    });
  });
});

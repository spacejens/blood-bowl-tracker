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

interface RosterFileContent {
  id: number;
  teamName: string;
  teamRace: string;
  player?: { applicationUserId: string };
  rosterMaster?: { name: string };
}

/**
 * Mirrors the real RosterParserService's contract closely enough for
 * RosterCollectionService's own logic to be exercised: a content body
 * missing rosterMaster fails to parse (as it does for the real, Zod-backed
 * parser), and a valid body maps id/teamRace/rosterMaster.name through to
 * the resulting TpRoster's id/teamRaceCode/raceName.
 */
function defaultParse(content: unknown): TpRoster {
  const c = content as RosterFileContent;
  if (!c.rosterMaster) {
    throw new Error('rosterMaster is required');
  }
  return {
    id: c.id,
    teamName: c.teamName,
    teamRaceCode: c.teamRace,
    raceName: c.rosterMaster.name,
    coachTpId: c.player?.applicationUserId ?? '',
    positions: [],
    starPositions: [],
    players: [],
  };
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

interface RosterOpts {
  id: number;
  teamRace: string;
  raceName: string;
}

function rosterFile(
  era: string,
  competition: string,
  opts: RosterOpts,
): TpSourceFile {
  return {
    era,
    competition,
    type: 'rosters',
    filename: `rosters_${opts.id}.json`,
    content: {
      id: opts.id,
      teamName: `Team ${opts.id}`,
      teamRace: opts.teamRace,
      player: { applicationUserId: 'coach-1' },
      lineUps: [],
      rosterMaster: {
        name: opts.raceName,
        starPlayersMasters: [],
        lineUpMasters: [],
      },
    },
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
    rosterParser.parse.mockImplementation(defaultParse);
    importResults = mock<ImportResultService>();
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
      sourceReader.files.mockImplementation(
        makeFiles([
          rosterFile('Fourth era', 'comp-a', {
            id: 1,
            teamRace: 'Orc',
            raceName: 'Orc',
          }),
          rosterFile('Fifth era', 'comp-b', {
            id: 2,
            teamRace: 'Dwarf',
            raceName: 'Dwarf',
          }),
        ]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(errors).toHaveLength(0);
      expect(rosters).toHaveLength(2);
      expect(rosters[0].era).toBe('Fourth era');
      expect(rosters[0].competition).toBe('comp-a');
      expect(rosters[0].roster.id).toBe(1);
      expect(rosters[0].roster.raceName).toBe('Orc');
      expect(rosters[1].era).toBe('Fifth era');
      expect(rosters[1].competition).toBe('comp-b');
      expect(rosters[1].roster.id).toBe(2);
      expect(rosters[1].roster.raceName).toBe('Dwarf');
    });

    it('ignores non-rosters files', async () => {
      sourceReader.files.mockImplementation(
        makeFiles([
          {
            era: 'Fourth era',
            competition: 'comp',
            type: 'tournament',
            filename: 'tournament_comp.json',
            content: { id: 1, name: 'X', ruleSet: 20 },
          },
          rosterFile('Fourth era', 'comp', {
            id: 1,
            teamRace: 'Orc',
            raceName: 'Orc',
          }),
        ]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toHaveLength(1);
    });

    it('records a parse error for one bad roster file but keeps the rest', async () => {
      sourceReader.files.mockImplementation(
        makeFiles([
          {
            era: 'Fourth era',
            competition: 'comp',
            type: 'rosters',
            filename: 'rosters_bad.json',
            content: { id: 9, teamName: 'T', teamRace: 'Orc' }, // no rosterMaster
          },
          rosterFile('Fourth era', 'comp', {
            id: 1,
            teamRace: 'Orc',
            raceName: 'Orc',
          }),
        ]),
      );

      const errors: ImportError[] = [];
      const rosters = await service.collect(errors);

      expect(rosters).toHaveLength(1);
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
        makeFiles([
          rosterFile('Fourth era', 'comp', {
            id: 1,
            teamRace: 'Orc',
            raceName: 'Orc',
          }),
        ]),
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
          [
            rosterFile('Fourth era', 'comp', {
              id: 1,
              teamRace: 'Orc',
              raceName: 'Orc',
            }),
          ],
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

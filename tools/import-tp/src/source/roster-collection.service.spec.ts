import type { ImportError } from '@blood-bowl-tracker/import';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it } from 'vitest';

import {
  RosterCollectionService,
  unknownEraError,
} from './roster-collection.service';
import type { TpSourceFile, TpSourceReader } from './tp-source-reader';

function makeService(
  files: () => AsyncIterable<TpSourceFile>,
  rosterParser: RosterParserService = new RosterParserService(),
): RosterCollectionService {
  return new RosterCollectionService(
    { files } as unknown as TpSourceReader,
    rosterParser,
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
      rosterMaster: {
        name: opts.raceName,
        starPlayersMasters: [],
        lineUpMasters: [],
      },
    },
  };
}

describe('RosterCollectionService', () => {
  it('collects every rosters file, tagging each roster with its era', async () => {
    const service = makeService(
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
    const service = makeService(
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
    const service = makeService(
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
    const throwingParser = {
      parse: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately models a non-Error throw for the instanceof-fallback branch
        throw 'a string error';
      },
    } as unknown as RosterParserService;
    const service = makeService(
      makeFiles([
        rosterFile('Fourth era', 'comp', {
          id: 1,
          teamRace: 'Orc',
          raceName: 'Orc',
        }),
      ]),
      throwingParser,
    );

    const errors: ImportError[] = [];
    const rosters = await service.collect(errors);

    expect(rosters).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('a string error');
  });

  it('records a diagnostic error but keeps rosters found before a scan failure', async () => {
    const service = makeService(
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
    const service = makeService(makeFilesThatThrow([], 'a string error'));

    const errors: ImportError[] = [];
    const rosters = await service.collect(errors);

    expect(rosters).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('a string error');
  });
});

describe('unknownEraError', () => {
  it('builds an ImportError naming the era and roster id', () => {
    const error = unknownEraError('Ghost era', {
      id: 42,
      teamName: 'T',
      teamRaceCode: 'Orc',
      raceName: 'Orc',
      coachTpId: 'coach-1',
      positions: [],
    });

    expect(error.item).toEqual({ era: 'Ghost era', roster: 42 });
    expect(error.message).toContain('Ghost era');
    expect(error.message).toContain('42');
  });
});

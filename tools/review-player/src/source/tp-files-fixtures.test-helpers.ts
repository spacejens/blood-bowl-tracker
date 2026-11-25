import type { TpFilesReaderService } from '@blood-bowl-tracker/read-tp-files';
import type { MockProxy } from 'vitest-mock-extended';

/** One download-tp file under `<dataDir>/<era>/<competition>/`. */
export interface TpEraFixture {
  era: string;
  competition: string;
  name: string;
  /** The parsed body readJson resolves; an Error makes readJson reject with it. */
  body: unknown;
}

/** One download-tp file under `<dataDir>/teams/<rulesSet>/`. */
export interface TpTeamsFixture {
  rulesSet: string;
  name: string;
  /** The parsed body readJson resolves; an Error makes readJson reject with it. */
  body: unknown;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Canned responses for a mocked TpFilesReaderService: each listing answers
 * with the fixtures' names in the order given (the order the test states, as
 * the real reader's sorted listing would give), and readJson answers with the
 * fixture's body. The fixture arrays are read at call time, so a test may
 * append to them after stubbing. No filesystem rules live here; those are the reader's own
 * spec's business.
 */
export function stubTpFiles(
  tpFiles: MockProxy<TpFilesReaderService>,
  fixtures: { eras?: TpEraFixture[]; teams?: TpTeamsFixture[] },
): void {
  const eras = fixtures.eras ?? [];
  const teams = fixtures.teams ?? [];
  tpFiles.listEras.mockImplementation(() =>
    Promise.resolve(distinct(eras.map((f) => f.era))),
  );
  tpFiles.listCompetitions.mockImplementation((_dataDir, era) =>
    Promise.resolve(
      distinct(eras.filter((f) => f.era === era).map((f) => f.competition)),
    ),
  );
  tpFiles.listFiles.mockImplementation((_dataDir, era, competition) =>
    Promise.resolve(
      eras
        .filter((f) => f.era === era && f.competition === competition)
        .map((f) => f.name),
    ),
  );
  tpFiles.listTeamsRulesSets.mockImplementation(() =>
    Promise.resolve(distinct(teams.map((f) => f.rulesSet))),
  );
  tpFiles.listTeamsFiles.mockImplementation((_dataDir, rulesSet) =>
    Promise.resolve(
      teams.filter((f) => f.rulesSet === rulesSet).map((f) => f.name),
    ),
  );
  tpFiles.readJson.mockImplementation((_dataDir, segments) => {
    const [first, second, third] = segments;
    const fixture =
      first === 'teams'
        ? teams.find((f) => f.rulesSet === second && f.name === third)
        : eras.find(
            (f) =>
              f.era === first && f.competition === second && f.name === third,
          );
    if (fixture === undefined) {
      return Promise.resolve(null);
    }
    if (fixture.body instanceof Error) {
      return Promise.reject(fixture.body);
    }
    return Promise.resolve({
      path: segments.join('/'),
      content: fixture.body,
    });
  });
}

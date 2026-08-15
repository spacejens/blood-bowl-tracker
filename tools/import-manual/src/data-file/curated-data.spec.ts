import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

const DATA_ROOT = join(__dirname, '../../data');

/**
 * Parses and validates every curated JSON5 file in one phase directory,
 * pooling the sections exactly as ManualDataReader does at runtime. These
 * tests guard the real curated data -- nothing else in the suite reads it --
 * so a typo in a group name or an invalid entry shape fails here rather than
 * halfway through a live import run.
 */
function readPhase(phase: string): ManualDataFile {
  const dir = join(DATA_ROOT, phase);
  const files = readdirSync(dir).filter((name) => name.endsWith('.json5'));
  const pooled = ManualDataFileSchema.parse({});
  for (const name of files) {
    const parsed = ManualDataFileSchema.parse(
      JSON5.parse(readFileSync(join(dir, name), 'utf8')),
    );
    for (const key of Object.keys(pooled) as (keyof ManualDataFile)[]) {
      (pooled[key] as unknown[]).push(...(parsed[key] as unknown[]));
    }
  }
  return pooled;
}

describe('curated data files', () => {
  it('parses every before-other-importers file', () => {
    expect(() => readPhase('before-other-importers')).not.toThrow();
  });

  it('parses every after-other-importers file', () => {
    expect(() => readPhase('after-other-importers')).not.toThrow();
  });

  it('curates both real leagues with BBL-compatible external ids', () => {
    const leagues = readPhase('before-other-importers').leagues;
    expect(leagues.map((league) => league.name).sort()).toEqual([
      'GBBL',
      'tLoEG',
    ]);
    for (const league of leagues) {
      expect(league.externalIds).toContainEqual({
        system: 'tloeg.bbleague.se',
        id: league.name,
      });
    }
  });

  it('curates all 16 competition groups against a real league', () => {
    const data = readPhase('before-other-importers');
    const leagueIds = new Set(
      data.leagues.flatMap((league) =>
        league.externalIds.map((ref) => `${ref.system}|${ref.id}`),
      ),
    );

    expect(data.competitionGroups).toHaveLength(16);
    expect(data.competitionGroups.map((group) => group.name)).toEqual([
      'Major Season',
      'Minor Season',
      'Chaos Cup',
      'Cabal Vision Cup',
      'Korpen',
      'Stunty Leeg',
      'Fright Night',
      'Snöbollskrieg',
      'Moot Mania',
      'Champion of tLoEG',
      'NAA',
      'Blitzmania!',
      'Ogretoberfest',
      'Dungeon Bowl',
      'Reserves Rumble',
      'GBBL',
    ]);
    for (const group of data.competitionGroups) {
      expect(leagueIds).toContain(`${group.league.system}|${group.league.id}`);
    }
  });

  it('re-declares the same leagues and groups in the after-other-importers phase', () => {
    // That phase is a separate process with its own empty ExternalIdMap, so
    // competitions.json5 can only resolve a group if the catalog is processed
    // there too. The files are symlinks to the before-other-importers
    // originals, so this asserts identity, not merely equality of content.
    const before = readPhase('before-other-importers');
    const after = readPhase('after-other-importers');

    expect(after.competitionGroups).toEqual(before.competitionGroups);
    expect(after.leagues).toEqual(before.leagues);
    for (const name of ['leagues.json5', 'competition-groups.json5']) {
      expect(
        lstatSync(
          join(DATA_ROOT, 'after-other-importers', name),
        ).isSymbolicLink(),
      ).toBe(true);
    }
  });

  it('classifies every curated trophy into a curated group', () => {
    const data = readPhase('before-other-importers');
    const groupNames = new Set(
      data.competitionGroups.map((group) => group.name),
    );

    expect(data.trophies).toHaveLength(29);
    for (const trophy of data.trophies) {
      expect(
        trophy.competitionGroup,
        `trophy "${trophy.name}" has no competitionGroup`,
      ).toBeDefined();
      expect(groupNames).toContain(trophy.competitionGroup!);
    }
  });

  it('classifies all 86 known competition instances into curated groups', () => {
    const groupNames = new Set(
      readPhase('before-other-importers').competitionGroups.map(
        (group) => group.name,
      ),
    );
    const competitions = readPhase('after-other-importers').competitions;

    expect(competitions).toHaveLength(86);
    const keys = new Set<string>();
    for (const competition of competitions) {
      expect(competition.externalIds).toHaveLength(1);
      const [ref] = competition.externalIds;
      const key = `${ref.system}|${ref.id}`;
      expect(keys, `duplicate external id ${key}`).not.toContain(key);
      keys.add(key);
      expect(
        competition.competitionGroup,
        `competition ${key} has no competitionGroup`,
      ).toBeDefined();
      expect(groupNames).toContain(competition.competitionGroup!);
    }
  });
});

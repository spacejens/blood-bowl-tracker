import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

const DATA_ROOT = join(import.meta.dirname, '../../data');

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
});

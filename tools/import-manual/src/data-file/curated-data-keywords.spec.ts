import { describe, expect, it } from 'vitest';

import { readFile } from './curated-data.test-helpers';

const keywordsFile = () => readFile('before-other-importers', 'keywords.json5');

describe('curated keywords', () => {
  it('registers the external systems it references', () => {
    const { externalSystems } = keywordsFile();
    expect(externalSystems).toContainEqual({
      name: 'Name',
      category: 'bookkeeping',
    });
    expect(externalSystems).toContainEqual({
      name: 'tourplay.net',
      category: 'imported_data_source',
    });
  });

  it('curates every confirmed keyword exactly once', () => {
    const { keywords } = keywordsFile();
    expect(keywords).toHaveLength(48);
    expect(new Set(keywords.map((k) => k.name)).size).toBe(48);
  });

  it('gives every keyword a Name id equal to its name', () => {
    for (const keyword of keywordsFile().keywords) {
      expect(keyword.externalIds).toContainEqual({
        system: 'Name',
        id: keyword.name,
      });
    }
  });

  it('gives every keyword exactly one numeric tourplay.net id', () => {
    const codes: string[] = [];
    for (const keyword of keywordsFile().keywords) {
      const tp = keyword.externalIds.filter(
        (id) => id.system === 'tourplay.net',
      );
      expect(tp).toHaveLength(1);
      expect(tp[0].id).toMatch(/^\d+$/);
      codes.push(tp[0].id);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('curates 39 species, 8 positional and 1 special keyword', () => {
    const kinds = keywordsFile().keywords.map((k) => k.kind);
    expect(kinds.filter((k) => k === 'species')).toHaveLength(39);
    expect(kinds.filter((k) => k === 'positional')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'special')).toHaveLength(1);
  });

  it('keys each positional keyword by its TP positionTypes bit value', () => {
    const byCode = new Map(
      keywordsFile().keywords.flatMap((keyword) =>
        keyword.externalIds
          .filter((id) => id.system === 'tourplay.net')
          .map((id) => [id.id, keyword] as const),
      ),
    );
    // TP's `positionTypes` bitmask on every BB2025 lineUpMaster and
    // starplayerMaster; the bit value itself is the keyword's code.
    const expected = [
      ['1', 'Lineman'],
      ['2', 'Runner'],
      ['4', 'Blitzer'],
      ['8', 'Thrower'],
      ['16', 'Catcher'],
      ['32', 'Blocker'],
      ['64', 'Special'],
    ] as const;
    for (const [code, name] of expected) {
      expect(byCode.get(code)?.name).toBe(name);
      expect(byCode.get(code)?.kind).toBe('positional');
    }
    // Big Guy is contributed by TP's separate `isBigGuy` flag, not a bit.
    expect(byCode.get('134')?.name).toBe('Big Guy');
    expect(byCode.get('134')?.kind).toBe('positional');
  });

  it('curates every Hatred and Animosity target code TP actually uses', () => {
    const byCode = new Map(
      keywordsFile().keywords.flatMap((keyword) =>
        keyword.externalIds
          .filter((id) => id.system === 'tourplay.net')
          .map((id) => [id.id, keyword.name] as const),
      ),
    );
    // Hatred (skillMasterId 307) and Animosity (269) target codes observed in
    // the downloaded TP data.
    expect(byCode.get('100')).toBe('Dwarf');
    expect(byCode.get('102')).toBe('Troll');
    expect(byCode.get('108')).toBe('Vampire');
    expect(byCode.get('110')).toBe('Undead');
    expect(byCode.get('111')).toBe('Goblin');
    expect(byCode.get('134')).toBe('Big Guy');
    expect(byCode.get('999')).toBe('All');
    expect(byCode.get('1001')).toBe('Daemon');
  });
});

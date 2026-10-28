import type { IncompleteImportTeamRow } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { IncompleteImportReportService } from './incomplete-import-report.service';

function row(
  overrides: Partial<IncompleteImportTeamRow> = {},
): IncompleteImportTeamRow {
  return {
    teamEraId: 1,
    teamId: 10,
    teamName: 'Orc Raiders',
    coachId: 100,
    coachName: 'Skarsnik',
    raceName: 'Orc',
    eraName: 'Season 3',
    incompletePlayerCount: 3,
    ...overrides,
  };
}

const skarsnik = row();
const roze = row({
  teamEraId: 2,
  teamId: 20,
  teamName: 'Dwarf Giants',
  coachId: 200,
  coachName: 'Roze Madder',
  raceName: 'Dwarf',
  incompletePlayerCount: 2,
});

const twoCoachHeader = 'Incomplete players: 5 · Teams: 2 · Coaches: 2';
const skarsnikLines = [
  'Skarsnik — 3 incomplete',
  '• Orc Raiders (Orc, Season 3) — 3 incomplete',
];
const rozeLines = [
  'Roze Madder — 2 incomplete',
  '• Dwarf Giants (Dwarf, Season 3) — 2 incomplete',
];

function teamLinesOf(page: string): string[] {
  return page.split('\n').filter((line) => line.startsWith('•'));
}

function coachHeadingsOf(page: string): string[] {
  return page
    .split('\n')
    .filter((line) => line.includes(' — ') && !line.startsWith('•'));
}

describe('IncompleteImportReportService', () => {
  let service: IncompleteImportReportService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [IncompleteImportReportService],
    }).compile();
    service = moduleRef.get(IncompleteImportReportService);
  });

  it('returns no pages for no rows', () => {
    expect(service.buildPages([])).toEqual([]);
  });

  it('renders totals, coach headings and team lines on one page', () => {
    expect(service.buildPages([roze, skarsnik])).toEqual([
      [twoCoachHeader, '', ...skarsnikLines, '', ...rozeLines].join('\n'),
    ]);
  });

  it('counts a team listed in several eras once in the team total', () => {
    const [page] = service.buildPages([
      skarsnik,
      row({ teamEraId: 3, eraName: 'Season 4', incompletePlayerCount: 1 }),
    ]);

    expect(page.split('\n')[0]).toBe(
      'Incomplete players: 4 · Teams: 1 · Coaches: 1',
    );
  });

  it('orders coaches by total incomplete players, most first', () => {
    const [page] = service.buildPages([
      skarsnik,
      { ...roze, incompletePlayerCount: 1 },
      {
        ...roze,
        teamEraId: 4,
        teamId: 21,
        teamName: 'Iron Hammers',
        incompletePlayerCount: 4,
      },
    ]);

    expect(coachHeadingsOf(page)).toEqual([
      'Roze Madder — 5 incomplete',
      'Skarsnik — 3 incomplete',
    ]);
  });

  it('orders coaches with equal totals by name', () => {
    const [page] = service.buildPages([
      row({ coachId: 1, coachName: 'Zed', teamId: 1, teamEraId: 1 }),
      row({ coachId: 2, coachName: 'Amy', teamId: 2, teamEraId: 2 }),
    ]);

    expect(coachHeadingsOf(page)).toEqual([
      'Amy — 3 incomplete',
      'Zed — 3 incomplete',
    ]);
  });

  it('orders teams within a coach by incomplete count, most first, then by name', () => {
    const [page] = service.buildPages([
      row({
        teamEraId: 5,
        teamId: 11,
        teamName: 'B Team',
        incompletePlayerCount: 1,
      }),
      row({
        teamEraId: 6,
        teamId: 12,
        teamName: 'A Team',
        incompletePlayerCount: 1,
      }),
      row({
        teamEraId: 7,
        teamId: 13,
        teamName: 'C Team',
        incompletePlayerCount: 5,
      }),
    ]);

    expect(teamLinesOf(page).map((line) => line.split(' (')[0])).toEqual([
      '• C Team',
      '• A Team',
      '• B Team',
    ]);
  });

  it('orders the same team in several eras by era name', () => {
    const [page] = service.buildPages([
      row({ teamEraId: 1, eraName: 'Season 4', incompletePlayerCount: 1 }),
      row({ teamEraId: 2, eraName: 'Season 2', incompletePlayerCount: 1 }),
    ]);

    expect(teamLinesOf(page)).toEqual([
      '• Orc Raiders (Orc, Season 2) — 1 incomplete',
      '• Orc Raiders (Orc, Season 4) — 1 incomplete',
    ]);
  });

  it('breaks pages on coach boundaries when two coaches do not fit together', () => {
    const first = [twoCoachHeader, '', ...skarsnikLines].join('\n');
    const second = [twoCoachHeader, '', ...rozeLines].join('\n');

    expect(
      service.buildPages(
        [skarsnik, roze],
        Math.max(first.length, second.length),
      ),
    ).toEqual([first, second]);
  });

  it('keeps two coaches on one page when the budget fits them exactly', () => {
    const combined = [
      twoCoachHeader,
      '',
      ...skarsnikLines,
      '',
      ...rozeLines,
    ].join('\n');

    expect(service.buildPages([skarsnik, roze], combined.length)).toEqual([
      combined,
    ]);
    expect(
      service.buildPages([skarsnik, roze], combined.length - 1),
    ).toHaveLength(2);
  });

  it('splits a coach too large for one page, repeating the heading', () => {
    const rows = ['Team A', 'Team B', 'Team C'].map((teamName, index) =>
      row({
        teamEraId: index + 1,
        teamId: index + 1,
        teamName,
        incompletePlayerCount: 1,
      }),
    );
    const header = 'Incomplete players: 3 · Teams: 3 · Coaches: 1';
    const heading = 'Skarsnik — 3 incomplete';
    const line = (name: string): string =>
      `• ${name} (Orc, Season 3) — 1 incomplete`;
    const first = [header, '', heading, line('Team A'), line('Team B')].join(
      '\n',
    );

    expect(service.buildPages(rows, first.length)).toEqual([
      first,
      [header, '', heading, line('Team C')].join('\n'),
    ]);
  });

  it('starts an oversized coach on a fresh page after a smaller coach', () => {
    const big = ['Team A', 'Team B', 'Team C'].map((teamName, index) =>
      row({
        teamEraId: index + 10,
        teamId: index + 10,
        teamName,
        coachId: 300,
        coachName: 'Big Coach',
        incompletePlayerCount: 1,
      }),
    );
    const header = 'Incomplete players: 7 · Teams: 4 · Coaches: 2';
    const heading = 'Big Coach — 3 incomplete';
    const line = (name: string): string =>
      `• ${name} (Orc, Season 3) — 1 incomplete`;
    const smallFirst = [
      header,
      '',
      'Roze Madder — 4 incomplete',
      '• Dwarf Giants (Dwarf, Season 3) — 4 incomplete',
    ].join('\n');
    const bigFirst = [header, '', heading, line('Team A'), line('Team B')].join(
      '\n',
    );
    const budget = Math.max(smallFirst.length, bigFirst.length);

    expect(
      service.buildPages(
        [...big, { ...roze, incompletePlayerCount: 4 }],
        budget,
      ),
    ).toEqual([
      smallFirst,
      bigFirst,
      [header, '', heading, line('Team C')].join('\n'),
    ]);
  });

  it('keeps every page within the embed limit and starts each with the totals', () => {
    const rows = Array.from({ length: 300 }, (_, index) =>
      row({
        teamEraId: index,
        teamId: index,
        teamName: `Team ${index} ${'x'.repeat(40)}`,
        coachId: index % 7,
        coachName: `Coach ${index % 7}`,
        incompletePlayerCount: (index % 5) + 1,
      }),
    );

    const pages = service.buildPages(rows);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      expect(page.startsWith('Incomplete players: ')).toBe(true);
    }
  });
});

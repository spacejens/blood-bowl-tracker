import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { CompetitionStandingsPageParser } from './competition-standings-page-parser';

function standingsPage(html: string): BblPage {
  return {
    type: 'se',
    params: { s: '69' },
    load: () => load(`<table class="tblist">${html}</table>`),
  };
}

/** One standings row: a badge cell plus a team cell, both carrying the onclick. */
function row(code: string): string {
  return (
    `<tr class="trlist">` +
    `<td onclick="gototeam('${code}')"><img src="badges/${code}.jpg"></td>` +
    `<td onclick="gototeam('${code}')">Team ${code}</td>` +
    `</tr>`
  );
}

describe('CompetitionStandingsPageParser', () => {
  let parser: CompetitionStandingsPageParser;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionStandingsPageParser,
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    parser = moduleRef.get(CompetitionStandingsPageParser);
  });

  it('extracts each registered team code from the standings rows', () => {
    const errors: ImportError[] = [];
    const page = standingsPage(row('red4') + row('äng'));

    const result = parser.extractRegisteredTeamIds(page, errors);

    expect(result).toEqual(new Set(['red4', 'äng']));
    expect(errors).toHaveLength(0);
  });

  it('returns an empty set for a page with no standings rows', () => {
    const errors: ImportError[] = [];
    const page = standingsPage('');

    const result = parser.extractRegisteredTeamIds(page, errors);

    expect(result.size).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('records an error and skips a row with no gototeam code, keeping the rest', () => {
    const errors: ImportError[] = [];
    const page = standingsPage(
      `<tr class="trlist"><td onclick="somethingElse()">bad</td></tr>` +
        row('äng'),
    );

    const result = parser.extractRegisteredTeamIds(page, errors);

    expect(result).toEqual(new Set(['äng']));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('no gototeam');
  });
});

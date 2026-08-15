import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page.types';
import { CompetitionTrophyPageParser } from './competition-trophy-page-parser';

function page(html: string): BblPage {
  return { type: 'sr', params: { s: '1' }, load: () => load(html) };
}

function trophyRow(label: string, code: string): string {
  return `<tr class="trlist" onclick="self.location.href='default.asp?p=tm&t=${code}';">
      <td class="td11"><img src="gfx/prize1.gif"></td>
      <td class="td11">${label}&nbsp;</td>
      <td class="td11"><b>Some Team</b></td>
    </tr>`;
}

function prizeRow(label: string, pid: string): string {
  return `<tr class="trlist" onclick="self.location.href='default.asp?p=pl&pid=${pid}';">
      <td class="td11"><img src="gfx/prize23.gif"></td>
      <td class="td11">${label}&nbsp;</td>
      <td class="td11"><b>Some Player</b></td>
    </tr>`;
}

function teamTable(...rows: string[]): string {
  return `<table class="tblist">
    <tr class="trlisthead"><th colspan="2">&nbsp;&nbsp;Team trophy</th><th>Winner</th></tr>
    ${rows.join('\n')}
  </table>`;
}

function prizeTable(...rows: string[]): string {
  return `<table class="tblist">
    <tr class="trlisthead"><th colspan="2">&nbsp;&nbsp;Player prize</th><th>Winner</th></tr>
    ${rows.join('\n')}
  </table>`;
}

const TROPHY_TABLE = teamTable(
  trophyRow('Major 1st', 'sew'),
  trophyRow('Major 2nd', 'vor'),
  trophyRow('Major 3rd', 'nur'),
  trophyRow('Major Wooden Spoon', 'san'),
);

const PLAYER_PRIZE_TABLE = prizeTable(prizeRow('Top Scorer', '102'));

describe('CompetitionTrophyPageParser', () => {
  let parser: CompetitionTrophyPageParser;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CompetitionTrophyPageParser],
    }).compile();
    parser = moduleRef.get(CompetitionTrophyPageParser);
  });

  describe('extractRows', () => {
    it('reads every Team trophy row, placements and named awards alike', () => {
      expect(
        parser.extractRows(page(TROPHY_TABLE + PLAYER_PRIZE_TABLE))
          .teamTrophies,
      ).toEqual([
        { label: 'Major 1st', teamCode: 'sew' },
        { label: 'Major 2nd', teamCode: 'vor' },
        { label: 'Major 3rd', teamCode: 'nur' },
        { label: 'Major Wooden Spoon', teamCode: 'san' },
      ]);
    });

    it('reads named cup award rows', () => {
      expect(
        parser.extractRows(
          page(teamTable(trophyRow('Cabal Vision Cup', 'vil'))),
        ).teamTrophies,
      ).toEqual([{ label: 'Cabal Vision Cup', teamCode: 'vil' }]);
    });

    it('reads every Player prize row', () => {
      const html = prizeTable(
        prizeRow('Top Scorer', '102'),
        prizeRow('Most Violent Player', '27'),
        prizeRow('Deadliest Player', '27'),
      );
      expect(parser.extractRows(page(html)).playerPrizes).toEqual([
        { label: 'Top Scorer', pid: '102' },
        { label: 'Most Violent Player', pid: '27' },
        { label: 'Deadliest Player', pid: '27' },
      ]);
    });

    it('keeps every tied winner of the same player prize', () => {
      const html = prizeTable(
        prizeRow('Top Intercepter', '10'),
        prizeRow('Top Intercepter', '11'),
        prizeRow('Top Intercepter', '12'),
        prizeRow('Top Intercepter', '13'),
      );
      expect(parser.extractRows(page(html)).playerPrizes).toHaveLength(4);
    });

    it('strips the trailing non-breaking space from a label', () => {
      expect(
        parser.extractRows(page(teamTable(trophyRow('Snöbollskrieg', 'vil'))))
          .teamTrophies[0].label,
      ).toBe('Snöbollskrieg');
    });

    it('returns empty lists when the page has neither table', () => {
      expect(parser.extractRows(page('<p>nothing here</p>'))).toEqual({
        teamTrophies: [],
        playerPrizes: [],
      });
    });

    it('ignores a row with no team or player link', () => {
      const html = `<table class="tblist">
        <tr class="trlisthead"><th colspan="2">Team trophy</th></tr>
        <tr class="trlist"><td class="td11"><img></td><td class="td11">Major 1st</td></tr>
      </table>`;
      expect(parser.extractRows(page(html)).teamTrophies).toEqual([]);
    });

    it('does not mistake player prize rows for team trophy rows', () => {
      const rows = parser.extractRows(page(PLAYER_PRIZE_TABLE));
      expect(rows.teamTrophies).toEqual([]);
      expect(rows.playerPrizes).toEqual([{ label: 'Top Scorer', pid: '102' }]);
    });
  });

  describe('placementsFrom', () => {
    it('reads first, second and third place team codes', () => {
      const rows = parser.extractRows(
        page(TROPHY_TABLE + PLAYER_PRIZE_TABLE),
      ).teamTrophies;
      expect(parser.placementsFrom(rows)).toEqual({
        first: 'sew',
        second: 'vor',
        third: 'nur',
      });
    });

    it('ignores the wooden spoon and other non-placement rows', () => {
      const rows = parser.extractRows(
        page(
          teamTable(
            trophyRow('Minor 1st', 'vil'),
            trophyRow('Cabal Vision Cup', 'vil'),
            trophyRow('Major Wooden Spoon', 'san'),
          ),
        ),
      ).teamTrophies;
      expect(parser.placementsFrom(rows)).toEqual({ first: 'vil' });
    });

    it('returns nothing for an empty row list', () => {
      expect(parser.placementsFrom([])).toEqual({});
    });

    it('drops a placement listed twice with different teams', () => {
      // Ambiguous: two different teams claim 1st, so neither can be trusted.
      const rows = parser.extractRows(
        page(
          teamTable(
            trophyRow('Major 1st', 'sew'),
            trophyRow('Minor 1st', 'vil'),
          ),
        ),
      ).teamTrophies;
      expect(parser.placementsFrom(rows)).toEqual({});
    });

    it('keeps a placement listed twice with the same team', () => {
      const rows = parser.extractRows(
        page(
          teamTable(
            trophyRow('Major 1st', 'sew'),
            trophyRow('Minor 1st', 'sew'),
          ),
        ),
      ).teamTrophies;
      expect(parser.placementsFrom(rows)).toEqual({ first: 'sew' });
    });
  });
});

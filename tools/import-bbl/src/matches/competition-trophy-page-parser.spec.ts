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

const TROPHY_TABLE = `<table class="tblist">
  <tr class="trlisthead"><th colspan="2">&nbsp;&nbsp;Team trophy</th><th>Winner</th></tr>
  ${trophyRow('Major 1st', 'sew')}
  ${trophyRow('Major 2nd', 'vor')}
  ${trophyRow('Major 3rd', 'nur')}
  ${trophyRow('Major Wooden Spoon', 'san')}
</table>`;

const PLAYER_PRIZE_TABLE = `<table class="tblist">
  <tr class="trlisthead"><th colspan="2">&nbsp;&nbsp;Player prize</th></tr>
  <tr class="trlist" onclick="self.location.href='default.asp?p=pl&pid=102';">
    <td class="td11">Top Scorer</td>
  </tr>
</table>`;

describe('CompetitionTrophyPageParser', () => {
  let parser: CompetitionTrophyPageParser;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CompetitionTrophyPageParser],
    }).compile();
    parser = moduleRef.get(CompetitionTrophyPageParser);
  });

  it('reads first, second and third place team codes', () => {
    expect(
      parser.extractPlacements(page(TROPHY_TABLE + PLAYER_PRIZE_TABLE)),
    ).toEqual({ first: 'sew', second: 'vor', third: 'nur' });
  });

  it('ignores the wooden spoon and other non-placement rows', () => {
    const html = `<table class="tblist">
      <tr class="trlisthead"><th colspan="2">Team trophy</th></tr>
      ${trophyRow('Minor 1st', 'vil')}
      ${trophyRow('Cabal Vision Cup', 'vil')}
      ${trophyRow('Major Wooden Spoon', 'san')}
    </table>`;
    expect(parser.extractPlacements(page(html))).toEqual({ first: 'vil' });
  });

  it('returns nothing when the page has no Team trophy table', () => {
    expect(parser.extractPlacements(page(PLAYER_PRIZE_TABLE))).toEqual({});
  });

  it('drops a placement listed twice with different teams', () => {
    const html = `<table class="tblist">
      <tr class="trlisthead"><th colspan="2">Team trophy</th></tr>
      ${trophyRow('Major 1st', 'sew')}
      ${trophyRow('Minor 1st', 'vil')}
    </table>`;
    // Ambiguous: two different teams claim 1st, so neither can be trusted.
    expect(parser.extractPlacements(page(html))).toEqual({});
  });

  it('keeps a placement listed twice with the same team', () => {
    const html = `<table class="tblist">
      <tr class="trlisthead"><th colspan="2">Team trophy</th></tr>
      ${trophyRow('Major 1st', 'sew')}
      ${trophyRow('Minor 1st', 'sew')}
    </table>`;
    expect(parser.extractPlacements(page(html))).toEqual({ first: 'sew' });
  });

  it('ignores a row with no gototeam-style team link', () => {
    const html = `<table class="tblist">
      <tr class="trlisthead"><th colspan="2">Team trophy</th></tr>
      <tr class="trlist"><td class="td11">Major 1st</td></tr>
    </table>`;
    expect(parser.extractPlacements(page(html))).toEqual({});
  });
});

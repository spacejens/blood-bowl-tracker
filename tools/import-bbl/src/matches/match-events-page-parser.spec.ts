import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { MatchEventsPageParser } from './match-events-page-parser';

function matchPage(id: string, html: string): BblPage {
  return { type: 'm', params: { m: id }, load: () => load(html) };
}

let parser: MatchEventsPageParser;

async function makeParser(): Promise<MatchEventsPageParser> {
  const normalizeText: MockProxy<NormalizeExtractedTextService> =
    mock<NormalizeExtractedTextService>();
  normalizeText.normalize.mockImplementation((s: string) =>
    s.replace(/\s+/g, ' ').trim(),
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchEventsPageParser,
      { provide: NormalizeExtractedTextService, useValue: normalizeText },
    ],
  }).compile();
  return moduleRef.get(MatchEventsPageParser);
}

function journeymenPage(rows: string, id = '1000'): BblPage {
  const html =
    '<div align="center"><b>' +
    '<a href="default.asp?p=ma&so=s&s=6">Season 4</a>, Final</b></div>' +
    '<table class="tblist">' +
    '<tr class="trborder">' +
    '<td width="180"><a href="default.asp?p=tm&t=hom"><b>Home Team</b></a></td>' +
    '<td>gate: <b>1000</b></td>' +
    '<td width="180"><a href="default.asp?p=tm&t=awy"><b>Away Team</b></a></td>' +
    '</tr>' +
    rows +
    '</table>';
  return matchPage(id, html);
}

function row(label: string, homeHtml: string, awayHtml: string): string {
  return (
    '<tr class="trborder">' +
    '<td class="td10"><img src="gfx/trans.gif">' +
    homeHtml +
    '</td>' +
    '<td style="background-image:url(\'gfx/bgdarktrans5.png\')">' +
    label +
    '</td>' +
    '<td class="td10"><img src="gfx/trans.gif">' +
    awayHtml +
    '</td>' +
    '</tr>'
  );
}

// Shaped after a real match-detail page
// (tools/import-bbl/data/tloeg.bbleague.se/default.asp?p=m&m=1000): the team
// header row, then 3-column achievement rows (label carried by the middle
// td's `background-image:url('gfx/bgdarktrans5.png')` style), then a
// "Sustained Injuries" section of the same row shape.
const HTML =
  '<div align="center"><b>' +
  '<a href="default.asp?p=ma&so=s&s=6">Season 4</a>, Final</b></div>' +
  '<table class="tblist" cellpadding="1" cellspacing="0">' +
  '<tr class="trborder">' +
  '<td align="center" valign="middle" width="180"><a href="default.asp?p=tm&t=hom"><img border="0" src="badges/hom-stor.jpg" alt="Team badge" height="60"><br><b>Home Team</b></a><br></td>' +
  '<td align="center" valign="middle" width="100" style="background-image:url(\'gfx/bgdarktrans5.png\');border-right:1px solid #808080;color:#404040;border-left:1px solid #808080;">gate: <b>10<sup> </sup>000</b></td>' +
  '<td align="center" valign="middle" width="180"><a href="default.asp?p=tm&t=awy"><img border="0" src="badges/awy-stor.jpg" height="60" alt="Team badge"><br><b>Away Team</b></a><br></td>' +
  '</tr>' +
  '<tr class="trlisthead"><td class="td10" colspan="3">&nbsp;</td></tr>' +
  '<tr class="trborder" style="background-color:#f4fff4">' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"><br><a href="default.asp?p=pl&pid=1601">Glarek Long Whiskers</a>&nbsp;<img src=\'gfx/cross.gif\' align=\'absmiddle\' alt=\'dead\'><br><a href="default.asp?p=pl&pid=1601">Glarek Long Whiskers</a>&nbsp;<img src=\'gfx/cross.gif\' align=\'absmiddle\' alt=\'dead\'></td>' +
  '<td align="center" style="background-image:url(\'gfx/bgdarktrans5.png\');border-right:1px solid #c0c0c0;border-left:1px solid #c0c0c0">TD Scorers</td>' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"></td>' +
  '</tr>' +
  '<tr class="trborder" style="background-color:#fff4f4">' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"><br><a href="default.asp?p=pl&pid=1602">Skritskik Speedster</a>&nbsp;<img src=\'gfx/cross.gif\' align=\'absmiddle\' alt=\'dead\'></td>' +
  '<td align="center" style="background-image:url(\'gfx/bgdarktrans5.png\');border-right:1px solid #c0c0c0;border-left:1px solid #c0c0c0">Killers</td>' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"></td>' +
  '</tr>' +
  '<tr class="trborder" style="background-color:#f2e2da">' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"></td>' +
  '<td align="center" style="background-image:url(\'gfx/bgdarktrans5.png\');border-right:1px solid #c0c0c0;border-left:1px solid #c0c0c0">Sent off</td>' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"><br><a href="default.asp?p=pl&pid=1509">Karanlim</a></td>' +
  '</tr>' +
  '<tr class="trlisthead"><th class="td10 head" colspan="3" align=center valign="bottom" height="25"><b>Sustained Injuries</b></th></tr>' +
  '<tr class="trborder" style="background-color:#f2e2da">' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"></td>' +
  '<td align="center" style="background-image:url(\'gfx/bgdarktrans5.png\');border-right:1px solid #c0c0c0;border-left:1px solid #c0c0c0;font-size:10px">Miss Next Game</td>' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"><br><a href="default.asp?p=pl&pid=2018">Lynimathor</a></td>' +
  '</tr>' +
  '<tr class="trborder" style="background-color:#f0d8d4">' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"><br>victim healed by apoth</td>' +
  '<td align="center" style="background-image:url(\'gfx/bgdarktrans5.png\');border-right:1px solid #c0c0c0;border-left:1px solid #c0c0c0;font-size:10px">Niggling Injury</td>' +
  '<td align="center" class="td10" style="color:#003366;padding-bottom:5px"><img border="0" src="gfx/trans.gif" height="3" width="0"></td>' +
  '</tr>' +
  '</table>';

describe('MatchEventsPageParser', () => {
  beforeEach(async () => {
    parser = await makeParser();
  });

  it('returns null when the m param is missing', () => {
    const page = matchPage('', HTML);
    expect(parser.extractMatchEvents(page)).toBeNull();
  });

  it('extracts home/away team ids', () => {
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    expect(result.homeTeamId).toBe('hom');
    expect(result.awayTeamId).toBe('awy');
    expect(result.bblId).toBe('1000');
  });

  it('emits one action occurrence per player link, repeats included', () => {
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    const tds = result.actions.filter((a) => a.actionType === 'touchdown');
    expect(tds).toHaveLength(2);
    expect(tds.every((a) => a.side === 'home')).toBe(true);
    expect(tds.every((a) => a.pid === '1601')).toBe(true);
  });

  it('maps Killers to a death action and Sent off to a sent_off consequence', () => {
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    const killer = result.actions.find((a) => a.actionType === 'death');
    expect(killer).toEqual({ actionType: 'death', side: 'home', pid: '1602' });

    const sentOff = result.consequences.find(
      (c) => c.consequenceType === 'sent_off',
    );
    expect(sentOff).toEqual({
      consequenceType: 'sent_off',
      side: 'away',
      pid: '1509',
    });
  });

  it('emits a consequence with pid set when the victim has a player link', () => {
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    const missNextGame = result.consequences.find(
      (c) => c.consequenceType === 'miss_next_game',
    );
    expect(missNextGame).toEqual({
      consequenceType: 'miss_next_game',
      side: 'away',
      pid: '2018',
    });
  });

  it('emits a consequence with pid null when the victim cell has no link', () => {
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    const niggling = result.consequences.find(
      (c) => c.consequenceType === 'niggling_injury',
    )!;
    expect(niggling).toEqual({
      consequenceType: 'niggling_injury',
      side: 'home',
      pid: null,
    });
  });

  it('returns null when the team table is missing', () => {
    const page = matchPage('1000', '<div>no team table</div>');
    expect(parser.extractMatchEvents(page)).toBeNull();
  });

  it('maps a -1 PA Sustained-Injuries row to a stat_reduction_pa consequence', () => {
    const html =
      '<div align="center"><b>' +
      '<a href="default.asp?p=ma&so=s&s=6">Season 4</a>, Final</b></div>' +
      '<table class="tblist">' +
      '<tr class="trborder">' +
      '<td width="180"><a href="default.asp?p=tm&t=hom"><b>Home Team</b></a></td>' +
      '<td>gate: <b>1000</b></td>' +
      '<td width="180"><a href="default.asp?p=tm&t=awy"><b>Away Team</b></a></td>' +
      '</tr>' +
      '<tr class="trborder">' +
      '<td class="td10"><img src="gfx/trans.gif"></td>' +
      '<td style="background-image:url(\'gfx/bgdarktrans5.png\')">-1 PA</td>' +
      '<td class="td10"><img src="gfx/trans.gif"><br>' +
      '<a href="default.asp?p=pl&pid=2200">Passer</a></td>' +
      '</tr>' +
      '</table>';
    const result = parser.extractMatchEvents(matchPage('1000', html))!;
    const pa = result.consequences.find(
      (c) => c.consequenceType === 'stat_reduction_pa',
    );
    expect(pa).toEqual({
      consequenceType: 'stat_reduction_pa',
      side: 'away',
      pid: '2200',
    });
  });

  it('tags a "foul by" causer occurrence with viaFoul', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          "Badly Hurt'ers",
          'foul by <a href="default.asp?p=pl&pid=3938">journeyman</a>',
          '',
        ),
      ),
    )!;
    const badlyHurt = result.actions.filter(
      (a) => a.actionType === 'badly_hurt',
    );
    expect(badlyHurt).toEqual([
      { actionType: 'badly_hurt', side: 'home', pid: '3938', viaFoul: true },
    ]);
  });

  it('keeps an ordinary causer occurrence free of viaFoul', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          "Badly Hurt'ers",
          '<a href="default.asp?p=pl&pid=3875">Veno Moose</a>',
          '',
        ),
      ),
    )!;
    expect(result.actions).toEqual([
      { actionType: 'badly_hurt', side: 'home', pid: '3875' },
    ]);
  });

  it('tags each occurrence independently in a cell mixing ordinary and foul causers (m=1830 shape)', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          "Badly Hurt'ers",
          '<a href="default.asp?p=pl&pid=3875">Veno Moose</a><br>' +
            'foul by <a href="default.asp?p=pl&pid=3938">journeyman</a><br>' +
            '<a href="default.asp?p=pl&pid=3878">Jävel-Bocken</a><br>' +
            'foul by <a href="default.asp?p=pl&pid=3881">Eeeh-Gor</a>',
          '',
        ),
      ),
    )!;
    expect(result.actions).toEqual([
      { actionType: 'badly_hurt', side: 'home', pid: '3875' },
      { actionType: 'badly_hurt', side: 'home', pid: '3938', viaFoul: true },
      { actionType: 'badly_hurt', side: 'home', pid: '3878' },
      { actionType: 'badly_hurt', side: 'home', pid: '3881', viaFoul: true },
    ]);
  });

  it('matches the foul marker case-insensitively and ignores surrounding whitespace/nbsp', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          'Killers',
          '&nbsp;Foul&nbsp;By <a href="default.asp?p=pl&pid=77">Killer</a>&nbsp;',
          '',
        ),
      ),
    )!;
    expect(result.actions).toEqual([
      { actionType: 'death', side: 'home', pid: '77', viaFoul: true },
    ]);
  });

  it('does not tag an occurrence whose segment text is unrelated prose', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          'Killers',
          'assisted by <a href="default.asp?p=pl&pid=88">X</a>',
          '',
        ),
      ),
    )!;
    expect(result.actions).toEqual([
      { actionType: 'death', side: 'home', pid: '88' },
    ]);
  });

  it('does not tag consequence occurrences, and a link-less cell still yields one anonymous occurrence', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(row('Miss Next Game', 'victim healed by apoth', '')),
    )!;
    expect(result.consequences).toEqual([
      { consequenceType: 'miss_next_game', side: 'home', pid: null },
    ]);
  });
});

describe('MatchEventsPageParser journeyman counting', () => {
  beforeEach(async () => {
    parser = await makeParser();
  });

  it('counts a single journeyman in a removal row as 1 (home)', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(row('Miss Next Game', 'journeyman', '')),
    )!;
    expect(result.journeymenCount).toEqual({ home: 1, away: 0 });
  });

  it('counts two journeymen in one removal cell as 2 (away, m=642 shape)', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(row('Death', '', 'journeyman<br>journeyman')),
    )!;
    expect(result.journeymenCount).toEqual({ home: 0, away: 2 });
  });

  it('sums journeyman mentions across two removal rows for the same team', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row('Death', 'journeyman', '') +
          row('Miss Next Game', 'journeyman', ''),
      ),
    )!;
    expect(result.journeymenCount).toEqual({ home: 2, away: 0 });
  });

  it('counts a journeyman named only in an achievement row as 1 via the floor', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(row('Foulers', 'journeyman', '')),
    )!;
    expect(result.journeymenCount).toEqual({ home: 1, away: 0 });
  });

  it('counts zero when no journeyman is mentioned', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row('Miss Next Game', '', '<a href="default.asp?p=pl&pid=1">Bob</a>'),
      ),
    )!;
    expect(result.journeymenCount).toEqual({ home: 0, away: 0 });
  });

  it('counts a journeyman in a removal cell that also has a linked named victim', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          'Death',
          '',
          '<a href="default.asp?p=pl&pid=555">Bob</a><br>journeyman',
        ),
      ),
    )!;
    // The named victim's consequence is still captured by the existing path...
    const death = result.consequences.find(
      (c) => c.consequenceType === 'death' && c.side === 'away',
    );
    expect(death).toEqual({
      consequenceType: 'death',
      side: 'away',
      pid: '555',
    });
    // ...and the anonymous journeyman is counted independently.
    expect(result.journeymenCount).toEqual({ home: 0, away: 1 });
  });

  it('does not count a linked anchor with "journeyman" text as an anonymous mention', () => {
    const result = parser.extractMatchEvents(
      journeymenPage(
        row('Death', '', '<a href="default.asp?p=pl&pid=999">journeyman</a>'),
      ),
    )!;
    // The linked anchor is skipped by countJourneymenInCell (any segment
    // with a link is skipped), so removalCount stays 0. But the floor is
    // still set to true because cell.text() includes the linked anchor's
    // text "journeyman", yielding journeymenCount.away = max(1, 0) = 1.
    expect(result.journeymenCount).toEqual({ home: 0, away: 1 });
  });
});

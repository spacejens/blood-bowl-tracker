import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import type { BblPage } from '../source/bbl-page';
import { MatchEventsPageParser } from './match-events-page-parser';

function matchPage(id: string, html: string): BblPage {
  return { type: 'm', params: { m: id }, load: () => load(html) };
}

const parser = new MatchEventsPageParser();

// Shaped after a real match-detail page
// (tools/import-bbl/data/tloeg.bbleague.se/default.asp?p=m&m=1000): the team
// header row, then 3-column achievement rows (label carried by the middle
// td's `background-image:url('gfx/bgdarktrans5.png')` style), then a
// "Sustained Injuries" section of the same row shape.
const HTML =
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
});

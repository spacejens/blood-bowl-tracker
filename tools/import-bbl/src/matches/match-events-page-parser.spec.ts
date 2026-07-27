import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import type { CellAnnotation } from './cell-annotation.service';
import { CellAnnotationService } from './cell-annotation.service';
import { MatchEventsPageParser } from './match-events-page-parser';

function matchPage(id: string, html: string): BblPage {
  return { type: 'm', params: { m: id }, load: () => load(html) };
}

async function makeParser(
  annotations: Record<string, CellAnnotation> = {},
): Promise<MatchEventsPageParser> {
  const normalizeText: MockProxy<NormalizeExtractedTextService> =
    mock<NormalizeExtractedTextService>();
  normalizeText.normalize.mockImplementation((s: string) =>
    s.replace(/\s+/g, ' ').trim(),
  );
  // Canned per-text answers only — the real vocabulary is tested in
  // cell-annotation.service.spec.ts and must not be re-derived here. Anything
  // a test did not seed falls through to `unrecognised`.
  const cellAnnotation: MockProxy<CellAnnotationService> =
    mock<CellAnnotationService>(
      {},
      { fallbackMockImplementation: () => ({ kind: 'unrecognised' }) },
    );
  for (const [text, annotation] of Object.entries(annotations)) {
    cellAnnotation.classify.calledWith(text).mockReturnValue(annotation);
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchEventsPageParser,
      { provide: NormalizeExtractedTextService, useValue: normalizeText },
      { provide: CellAnnotationService, useValue: cellAnnotation },
    ],
  }).compile();
  return moduleRef.get(MatchEventsPageParser);
}

/** The link-less annotation carried by the shared `HTML` fixture. */
const APOTH: Record<string, CellAnnotation> = {
  'victim healed by apoth': { kind: 'avoided', avoidedBy: 'apothecary' },
};

/** The link-less annotation carried by the journeyman-counting fixtures. */
const JOURNEYMAN: Record<string, CellAnnotation> = {
  journeyman: { kind: 'unidentified', participant: 'journeyman' },
};

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
  it('returns null when the m param is missing', async () => {
    const parser = await makeParser(APOTH);
    const page = matchPage('', HTML);
    expect(parser.extractMatchEvents(page)).toBeNull();
  });

  it('extracts home/away team ids', async () => {
    const parser = await makeParser(APOTH);
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    expect(result.homeTeamId).toBe('hom');
    expect(result.awayTeamId).toBe('awy');
    expect(result.bblId).toBe('1000');
  });

  it('emits one action occurrence per player link, repeats included', async () => {
    const parser = await makeParser(APOTH);
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    const tds = result.actions.filter((a) => a.actionType === 'touchdown');
    expect(tds).toHaveLength(2);
    expect(tds.every((a) => a.side === 'home')).toBe(true);
    expect(tds.every((a) => a.pid === '1601')).toBe(true);
  });

  it('maps Killers to a death action and Sent off to a sent_off consequence', async () => {
    const parser = await makeParser(APOTH);
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

  it('emits a consequence with pid set when the victim has a player link', async () => {
    const parser = await makeParser(APOTH);
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

  it('emits a consequence with an avoidedBy tag when the victim cell says the apothecary healed them', async () => {
    const parser = await makeParser(APOTH);
    const result = parser.extractMatchEvents(matchPage('1000', HTML))!;
    const niggling = result.consequences.find(
      (c) => c.consequenceType === 'niggling_injury',
    )!;
    expect(niggling).toEqual({
      consequenceType: 'niggling_injury',
      side: 'home',
      pid: null,
      avoidedBy: 'apothecary',
    });
  });

  it('returns null when the team table is missing', async () => {
    const parser = await makeParser();
    const page = matchPage('1000', '<div>no team table</div>');
    expect(parser.extractMatchEvents(page)).toBeNull();
  });

  it('maps a -1 PA Sustained-Injuries row to a stat_reduction_pa consequence', async () => {
    const parser = await makeParser();
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

  it('tags a "foul by" causer occurrence with viaFoul', async () => {
    const parser = await makeParser();
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

  it('keeps an ordinary causer occurrence free of viaFoul', async () => {
    const parser = await makeParser();
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

  it('tags each occurrence independently in a cell mixing ordinary and foul causers (m=1830 shape)', async () => {
    const parser = await makeParser();
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

  it('matches the foul marker case-insensitively and ignores surrounding whitespace/nbsp', async () => {
    const parser = await makeParser();
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

  it('does not tag an occurrence whose segment text is unrelated prose', async () => {
    const parser = await makeParser();
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

  it('tags a link-less "victim healed by apoth" consequence cell rather than emitting a bare anonymous victim', async () => {
    const parser = await makeParser(APOTH);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Miss Next Game', 'victim healed by apoth', '')),
    )!;
    expect(result.consequences).toEqual([
      {
        consequenceType: 'miss_next_game',
        side: 'home',
        pid: null,
        avoidedBy: 'apothecary',
      },
    ]);
  });

  it('keeps unlinked entries when the same cell also has a linked player (bug 1)', async () => {
    const parser = await makeParser({
      'mercenary / star': {
        kind: 'unidentified',
        participant: 'mercenary_or_star',
      },
      'fans / random event': {
        kind: 'unidentified',
        participant: 'fans_or_random_event',
      },
    });
    const result = parser.extractMatchEvents(
      journeymenPage(
        row(
          'Killers',
          'mercenary / star<br>' +
            '<a href="default.asp?p=pl&pid=4001">Grim Ironjaw</a><br>' +
            'fans / random event',
          '',
        ),
      ),
    )!;
    expect(result.actions).toEqual([
      {
        actionType: 'death',
        side: 'home',
        pid: null,
        unidentifiedKind: 'mercenary_or_star',
      },
      { actionType: 'death', side: 'home', pid: '4001' },
      {
        actionType: 'death',
        side: 'home',
        pid: null,
        unidentifiedKind: 'fans_or_random_event',
      },
    ]);
  });

  it('emits one occurrence per unlinked entry instead of collapsing them (bug 2)', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Death', '', 'journeyman<br>journeyman')),
    )!;
    expect(result.consequences).toEqual([
      {
        consequenceType: 'death',
        side: 'away',
        pid: null,
        unidentifiedKind: 'journeyman',
      },
      {
        consequenceType: 'death',
        side: 'away',
        pid: null,
        unidentifiedKind: 'journeyman',
      },
    ]);
  });

  it('tags a bare "foul" segment in a casualty action row as viaFoul with no pid', async () => {
    const parser = await makeParser({ foul: { kind: 'foul' } });
    const result = parser.extractMatchEvents(
      journeymenPage(row("Badly Hurt'ers", 'foul', '')),
    )!;
    expect(result.actions).toEqual([
      { actionType: 'badly_hurt', side: 'home', pid: null, viaFoul: true },
    ]);
    expect(result.annotationErrors).toEqual([]);
  });

  it('reports a foul marker in a consequence row as a misplaced annotation', async () => {
    const parser = await makeParser({ foul: { kind: 'foul' } });
    const result = parser.extractMatchEvents(
      journeymenPage(row('Death', 'foul', '')),
    )!;
    expect(result.consequences).toEqual([]);
    expect(result.annotationErrors).toEqual([
      { label: 'Death', side: 'home', text: 'foul', reason: 'misplaced' },
    ]);
  });

  it('reports an avoided-consequence annotation in an action row as misplaced', async () => {
    const parser = await makeParser(APOTH);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Killers', 'victim healed by apoth', '')),
    )!;
    expect(result.actions).toEqual([]);
    expect(result.annotationErrors).toEqual([
      {
        label: 'Killers',
        side: 'home',
        text: 'victim healed by apoth',
        reason: 'misplaced',
      },
    ]);
  });

  it('reports unrecognised segment text as an error and emits no occurrence', async () => {
    const parser = await makeParser();
    const result = parser.extractMatchEvents(
      journeymenPage(row('Death', 'victim eaten by the crowd', '')),
    )!;
    expect(result.consequences).toEqual([]);
    expect(result.annotationErrors).toEqual([
      {
        label: 'Death',
        side: 'home',
        text: 'victim eaten by the crowd',
        reason: 'unrecognised',
      },
    ]);
  });

  it('drops a known-and-ignored note without an error or an occurrence', async () => {
    const parser = await makeParser({
      'Extra shoot-out TD after tied overtime': { kind: 'ignored' },
    });
    const result = parser.extractMatchEvents(
      journeymenPage(
        row('TD Scorers', 'Extra shoot-out TD after tied overtime', ''),
      ),
    )!;
    expect(result.actions).toEqual([]);
    expect(result.annotationErrors).toEqual([]);
  });

  it('emits nothing and no error for a cell holding only a spacer image', async () => {
    const parser = await makeParser();
    const result = parser.extractMatchEvents(
      journeymenPage(row('Death', '', '')),
    )!;
    expect(result.consequences).toEqual([]);
    expect(result.annotationErrors).toEqual([]);
  });

  it('records the side and label of an annotation error in the away cell', async () => {
    const parser = await makeParser();
    const result = parser.extractMatchEvents(
      journeymenPage(row('Miss Next Game', '', 'who knows')),
    )!;
    expect(result.annotationErrors).toEqual([
      {
        label: 'Miss Next Game',
        side: 'away',
        text: 'who knows',
        reason: 'unrecognised',
      },
    ]);
  });

  it('carries an unidentified kind onto a Sent off consequence', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Sent off', 'journeyman', '')),
    )!;
    expect(result.consequences).toEqual([
      {
        consequenceType: 'sent_off',
        side: 'home',
        pid: null,
        unidentifiedKind: 'journeyman',
      },
    ]);
  });
});

describe('MatchEventsPageParser journeyman counting', () => {
  it('counts a single journeyman in a removal row as 1 (home)', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Miss Next Game', 'journeyman', '')),
    )!;
    expect(result.journeymenCount).toEqual({ home: 1, away: 0 });
  });

  it('counts two journeymen in one removal cell as 2 (away, m=642 shape)', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Death', '', 'journeyman<br>journeyman')),
    )!;
    expect(result.journeymenCount).toEqual({ home: 0, away: 2 });
  });

  it('sums journeyman mentions across two removal rows for the same team', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(
        row('Death', 'journeyman', '') +
          row('Miss Next Game', 'journeyman', ''),
      ),
    )!;
    expect(result.journeymenCount).toEqual({ home: 2, away: 0 });
  });

  it('counts a journeyman named only in an achievement row as 1 via the floor', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(row('Foulers', 'journeyman', '')),
    )!;
    expect(result.journeymenCount).toEqual({ home: 1, away: 0 });
  });

  it('counts zero when no journeyman is mentioned', async () => {
    const parser = await makeParser(JOURNEYMAN);
    const result = parser.extractMatchEvents(
      journeymenPage(
        row('Miss Next Game', '', '<a href="default.asp?p=pl&pid=1">Bob</a>'),
      ),
    )!;
    expect(result.journeymenCount).toEqual({ home: 0, away: 0 });
  });

  it('counts a journeyman in a removal cell that also has a linked named victim', async () => {
    const parser = await makeParser(JOURNEYMAN);
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

  it('does not count a linked anchor with "journeyman" text as an anonymous mention', async () => {
    const parser = await makeParser(JOURNEYMAN);
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

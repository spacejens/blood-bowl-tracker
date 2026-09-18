import { Test } from '@nestjs/testing';
import { load } from 'cheerio';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { SkillEntryService } from '../shared/skill-entry.service';
import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { PlayerPageParser } from './player-page-parser';
import { SustainedInjuriesParser } from './sustained-injuries.parser';

function playerPage(html: string, pid = '5'): BblPage {
  return { type: 'pl', params: { pid }, load: () => load(html) };
}

/** The all-clean lasting-injuries value a page with no injuries parses to. */
const NO_INJURIES = {
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

/** The all-zero counts a player with no characteristic-increase markers parses to. */
const NO_CHARACTERISTIC_INCREASES = {
  move: 0,
  strength: 0,
  agility: 0,
  passing: 0,
  armour: 0,
};

describe('PlayerPageParser', () => {
  let parser: PlayerPageParser;
  let normalizeText: MockProxy<NormalizeExtractedTextService>;

  beforeEach(async () => {
    normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerPageParser,
        SustainedInjuriesParser,
        SkillEntryService,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(PlayerPageParser);
  });

  /** The two links every player page needs for extractPlayer to succeed. */
  const PLAYER_LINKS =
    '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
    '<a href="default.asp?p=tm&t=knu">Knights</a>';

  /** A characteristics table with the given five value cells, in column order. */
  function characteristicsTable(...values: string[]): string {
    return (
      '<table class="tblist">' +
      '<tr class="trlisthead">' +
      '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
      '</tr>' +
      '<tr>' +
      values.map((v) => `<td>${v}</td>`).join('') +
      '<td>Sure Hands</td>' +
      '</tr>' +
      '</table>'
    );
  }

  it('extracts the pid, name, position typId and team code', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
      '5',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Griff Oberwald',
      typId: '33',
      teamCode: 'knu',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
      lastingInjuries: NO_INJURIES,
      skills: [{ name: 'Sure Hands', source: 'starting' }],
      characteristicIncreaseCounts: NO_CHARACTERISTIC_INCREASES,
    });
  });

  it('extracts a team code containing non-ASCII characters', () => {
    const page = playerPage(
      '<h1>Aspgren</h1>' +
        '<a href="default.asp?p=pt&typID=169">Hafling Treeman</a>' +
        "<a href='default.asp?p=tm&t=gås' style='font-size:11px'>Gåshöjdens BK</a>" +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Aspgren',
      typId: '169',
      teamCode: 'gås',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
      lastingInjuries: NO_INJURIES,
      skills: [{ name: 'Sure Hands', source: 'starting' }],
      characteristicIncreaseCounts: NO_CHARACTERISTIC_INCREASES,
    });
  });

  it('uses the first position and team links when several are present', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>' +
        '<a href="default.asp?p=pt&typID=99">Other</a>' +
        '<a href="default.asp?p=tm&t=abc">Other Team</a>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '5',
      name: 'Griff Oberwald',
      typId: '33',
      teamCode: 'knu',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
      lastingInjuries: NO_INJURIES,
      skills: [{ name: 'Sure Hands', source: 'starting' }],
      characteristicIncreaseCounts: NO_CHARACTERISTIC_INCREASES,
    });
  });

  it('returns null when the position link is missing', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the team link is missing', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null for a page with no relevant links', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' + '<a href="default.asp?p=tl#16">Orc Team</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns a player with an empty name when the h1 is present but empty', () => {
    const page = playerPage(
      '<h1></h1>' +
        '<a href="default.asp?p=pt&typID=53">Skeleton Linemen</a>' +
        '<a href="default.asp?p=tm&t=nyt3">No name no pain!</a>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
      '388',
    );
    expect(parser.extractPlayer(page)).toEqual({
      pid: '388',
      name: '',
      typId: '53',
      teamCode: 'nyt3',
      sppTotal: null,
      characteristics: {
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
      lastingInjuries: NO_INJURIES,
      skills: [{ name: 'Sure Hands', source: 'starting' }],
      characteristicIncreaseCounts: NO_CHARACTERISTIC_INCREASES,
    });
  });

  it('returns null when there is no h1 element at all', () => {
    const page = playerPage(
      '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
        '<a href="default.asp?p=tm&t=knu">Knights</a>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the pid param is missing', () => {
    const page: BblPage = {
      type: 'pl',
      params: {},
      load: () =>
        load(
          '<h1>Griff Oberwald</h1>' +
            '<a href="default.asp?p=pt&typID=33">x</a>' +
            '<a href="default.asp?p=tm&t=knu">y</a>',
        ),
    };
    expect(parser.extractPlayer(page)).toBeNull();
  });

  const UNSPENT_SPP_ROW =
    '<table><tr>' +
    '<td class="small">Unspent SPP:</td>' +
    '<td class="esmall" align="center">5</td>' +
    '<td class="esmall"><span class="opaque50">(<a href=\'default.asp?p=mp&act=spp&pid=5\'>11</a>)</span></td>' +
    '</tr></table>';

  it('scrapes the career SPP total from the Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        UNSPENT_SPP_ROW +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(11);
  });

  it('scrapes a zero career total that carries no breakdown link', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">0</td>' +
        '<td class="esmall"><span class="opaque50">(0)</span></td></tr></table>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(0);
  });

  it('ignores the unspent figure, including a negative one', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">-7</td>' +
        '<td class="esmall"><span class="opaque50">(<a href=\'x\'>31</a>)</span></td></tr></table>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(31);
  });

  it('returns a null career total when the page has no Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBeNull();
  });

  it('skips over unrelated td cells while looking for the Unspent SPP row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Some other stat:</td>' +
        '<td class="esmall">99</td></tr></table>' +
        UNSPENT_SPP_ROW +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBe(11);
  });

  it('returns a null career total when the row carries no parenthesized figure', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table><tr><td class="small">Unspent SPP:</td>' +
        '<td class="esmall" align="center">5</td></tr></table>' +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.sppTotal).toBeNull();
  });

  it('extracts the characteristics line, stripping the plus suffixes', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '3', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)?.characteristics).toEqual({
      move: 5,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 8,
    });
  });

  it('parses a dash Passing cell as null', () => {
    const page = playerPage(
      '<h1>Grashnak</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '5', '4+', '-', '10+'),
    );
    expect(parser.extractPlayer(page)?.characteristics).toEqual({
      move: 5,
      strength: 5,
      agility: 4,
      passing: null,
      armour: 10,
    });
  });

  it('finds the characteristics table by its header text, not its position', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table class="tblist">' +
        '<tr class="trlisthead"><th>Season</th><th>TD</th><th>Cas</th></tr>' +
        '<tr><td>4</td><td>2</td><td>1</td></tr>' +
        '</table>' +
        characteristicsTable('6', '3', '3+', '5+', '9+'),
    );
    expect(parser.extractPlayer(page)?.characteristics).toEqual({
      move: 6,
      strength: 3,
      agility: 3,
      passing: 5,
      armour: 9,
    });
  });

  it('returns null when a non-Passing characteristic cell is unreadable', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '?', '3+', '4+', '8+'),
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the Passing cell is neither a dash nor a number', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        characteristicsTable('5', '3', '3+', 'n/a', '8+'),
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the value row has fewer cells than the header row', () => {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table class="tblist">' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
        '</tr>' +
        '<tr><td>5</td><td>3</td></tr>' +
        '</table>',
    );
    expect(parser.extractPlayer(page)).toBeNull();
  });

  it('returns null when the page has no characteristics table at all', () => {
    const page = playerPage('<h1>Griff Oberwald</h1>' + PLAYER_LINKS);
    expect(parser.extractPlayer(page)).toBeNull();
  });

  /** The real markup of a player page's Sustained Injuries row. */
  function sustainedInjuriesRow(value: string): string {
    return `
<table class="tblist" width="320">
 <tr height="25">
  <td width="94" class="small dark3" align="center" valign="middle"><a href="default.asp?p=mp&act=inj&pid=1990" title="se list of matches">Sustained Injuries:</a></td>
  <td class="small red3">${value}</td>
 </tr>
</table>`;
  }

  it('parses the sustained-injuries row', () => {
    const page = playerPage(
      `<h1>Griff Oberwald</h1>${PLAYER_LINKS}${characteristicsTable('6', '3', '3', '4', '9')}${sustainedInjuriesRow(
        `-AV, &nbsp;<span color='#ffa0a0'>1</span> niggling inj.`,
      )}`,
      '1990',
    );

    expect(parser.extractPlayer(page)?.lastingInjuries).toEqual({
      missNextGame: false,
      nigglingInjuryCount: 1,
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 1,
    });
  });

  it("reads BBL's greyed-out none as a clean player", () => {
    const page = playerPage(
      `<h1>Griff Oberwald</h1>${PLAYER_LINKS}${characteristicsTable('6', '3', '3', '4', '9')}${sustainedInjuriesRow(
        `<span style='color:#808080'>none</span>`,
      )}`,
      '1990',
    );

    expect(
      parser.extractPlayer(page)?.lastingInjuries.nigglingInjuryCount,
    ).toBe(0);
    expect(parser.extractPlayer(page)?.lastingInjuries.missNextGame).toBe(
      false,
    );
  });

  it('keeps the <br> before the miss-next-game line from gluing words together', () => {
    const page = playerPage(
      `<h1>Griff Oberwald</h1>${PLAYER_LINKS}${characteristicsTable('6', '3', '3', '4', '9')}${sustainedInjuriesRow(
        `<span color='#ffa0a0'>1</span> niggling inj.<br>Must miss the next match due to injury`,
      )}`,
      '1990',
    );

    const injuries = parser.extractPlayer(page)?.lastingInjuries;
    expect(injuries?.nigglingInjuryCount).toBe(1);
    expect(injuries?.missNextGame).toBe(true);
  });

  it('treats a page with no sustained-injuries row as a clean player, not a parse failure', () => {
    // Unlike the characteristics line, whose absence means the page cannot be
    // read at all, "no injuries" is an ordinary state.
    const page = playerPage(
      `<h1>Griff Oberwald</h1>${PLAYER_LINKS}${characteristicsTable('6', '3', '3', '4', '9')}`,
      '1990',
    );

    const player = parser.extractPlayer(page);
    expect(player).not.toBeNull();
    expect(player?.lastingInjuries.nigglingInjuryCount).toBe(0);
  });

  it('throws when the sustained-injuries label is found but has no following value cell', () => {
    // Distinct from "no row at all": here the label WAS found, so the page
    // structure is malformed/truncated rather than genuinely injury-free.
    // Silently falling through to the same clean default as the "no row"
    // case would risk masking a real injury if the page ever fails to load
    // completely or BBL's structure glitches.
    const page = playerPage(
      `<h1>Griff Oberwald</h1>${PLAYER_LINKS}${characteristicsTable('6', '3', '3', '4', '9')}` +
        '<table class="tblist" width="320">' +
        ' <tr height="25">' +
        '  <td width="94" class="small dark3" align="center" valign="middle">' +
        '   <a href="default.asp?p=mp&act=inj&pid=1990" title="se list of matches">Sustained Injuries:</a>' +
        '  </td>' +
        ' </tr>' +
        '</table>',
      '1990',
    );

    expect(() => parser.extractPlayer(page)).toThrow(
      'Invalid sustained-injuries row: missing value cell',
    );
  });
});

describe('PlayerPageParser skills cell', () => {
  let parser: PlayerPageParser;

  beforeEach(async () => {
    const normalizeText = mock<NormalizeExtractedTextService>();
    normalizeText.normalize.mockImplementation((s: string) =>
      s.replace(/\s+/g, ' ').trim(),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerPageParser,
        SustainedInjuriesParser,
        SkillEntryService,
        { provide: NormalizeExtractedTextService, useValue: normalizeText },
      ],
    }).compile();
    parser = moduleRef.get(PlayerPageParser);
  });

  /** The links every player page needs for extractPlayer to succeed. */
  const PLAYER_LINKS =
    '<a href="default.asp?p=pt&typID=33">Goblin Linemen</a>' +
    '<a href="default.asp?p=tm&t=knu">Knights</a>';

  /**
   * A full player page whose characteristics row's sixth (Skills) cell holds
   * the given markup.
   */
  function parsePlayerWithSkillsCell(cellHtml: string) {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table class="tblist">' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th>' +
        '</tr>' +
        '<tr>' +
        '<td>5</td><td>3</td><td>3+</td><td>4+</td><td>8+</td>' +
        `<td>${cellHtml}</td>` +
        '</tr>' +
        '</table>',
    );
    return parser.extractPlayer(page);
  }

  /**
   * A full player page whose characteristics row carries only the five
   * value cells, with no Skills cell at all.
   */
  function parsePlayerWithoutSkillsCell() {
    const page = playerPage(
      '<h1>Griff Oberwald</h1>' +
        PLAYER_LINKS +
        '<table class="tblist">' +
        '<tr class="trlisthead">' +
        '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th>' +
        '</tr>' +
        '<tr>' +
        '<td>5</td><td>3</td><td>3+</td><td>4+</td><td>8+</td>' +
        '</tr>' +
        '</table>',
    );
    return parser.extractPlayer(page);
  }

  it('reads plain entries as starting skills with no advancement order', () => {
    const player = parsePlayerWithSkillsCell('Stunty, Right Stuff, Dodge');

    expect(player?.skills).toEqual([
      { name: 'Stunty', source: 'starting' },
      { name: 'Right Stuff', source: 'starting' },
      { name: 'Dodge', source: 'starting' },
    ]);
  });

  it('reads a coloured entry as an advancement, numbered among gained skills only', () => {
    const player = parsePlayerWithSkillsCell(
      "Stunty, <span style='color:#006020'>Dauntless</span>, Dodge, " +
        "<span style='color:#006020'>Block</span>",
    );

    expect(player?.skills).toEqual([
      { name: 'Stunty', source: 'starting' },
      { name: 'Dauntless', source: 'advancement', advancementOrder: 1 },
      { name: 'Dodge', source: 'starting' },
      { name: 'Block', source: 'advancement', advancementOrder: 2 },
    ]);
  });

  it('splits a parenthetical on a gained skill into its attribute value', () => {
    const player = parsePlayerWithSkillsCell(
      "<span style='color:#006020'>Mighty Blow (+1)</span>",
    );

    expect(player?.skills).toEqual([
      {
        name: 'Mighty Blow',
        attributeValue: '+1',
        source: 'advancement',
        advancementOrder: 1,
      },
    ]);
  });

  it('skips a pending advancement slot without numbering it', () => {
    const player = parsePlayerWithSkillsCell(
      "Dodge, <span style='color:#006020'>Dauntless</span>, " +
        "<span style='color:#006020'> <span style='color:#f02020'>?</span></span>",
    );

    expect(player?.skills).toEqual([
      { name: 'Dodge', source: 'starting' },
      { name: 'Dauntless', source: 'advancement', advancementOrder: 1 },
    ]);
  });

  it('keeps a nested span inside a gained skill when it is not the pending marker', () => {
    const player = parsePlayerWithSkillsCell(
      "<span style='color:#006020'>Mighty <span>Blow</span></span>",
    );

    expect(player?.skills).toEqual([
      { name: 'Mighty Blow', source: 'advancement', advancementOrder: 1 },
    ]);
  });

  it('reads an empty skills cell as no skills', () => {
    expect(parsePlayerWithSkillsCell('')?.skills).toEqual([]);
  });

  it('reads a page whose characteristics row has no skills cell as no skills', () => {
    expect(parsePlayerWithoutSkillsCell()?.skills).toEqual([]);
  });

  const ZERO_COUNTS = {
    move: 0,
    strength: 0,
    agility: 0,
    passing: 0,
    armour: 0,
  };

  it('gives a player with no markers all-zero characteristic-increase counts', () => {
    const player = parsePlayerWithSkillsCell('Stunty, Dodge');

    expect(player?.characteristicIncreaseCounts).toEqual(ZERO_COUNTS);
  });

  it('excludes a characteristic-increase marker from the skill list and counts it', () => {
    const player = parsePlayerWithSkillsCell(
      "Block, Dauntless, <span style='color:#006020'>Dodge</span>, " +
        "<span style='color:#006020'> +MA</span>, " +
        "<span style='color:#006020'> Sprint</span>",
    );

    expect(player?.skills).toEqual([
      { name: 'Block', source: 'starting' },
      { name: 'Dauntless', source: 'starting' },
      { name: 'Dodge', source: 'advancement', advancementOrder: 1 },
      { name: 'Sprint', source: 'advancement', advancementOrder: 2 },
    ]);
    expect(player?.characteristicIncreaseCounts).toEqual({
      ...ZERO_COUNTS,
      move: 1,
    });
  });

  it('counts the same marker twice when it appears twice for one player', () => {
    const player = parsePlayerWithSkillsCell(
      "<span style='color:#006020'> +AG</span>, " +
        "<span style='color:#006020'>Dodge</span>, " +
        "<span style='color:#006020'> +AG</span>",
    );

    expect(player?.skills).toEqual([
      { name: 'Dodge', source: 'advancement', advancementOrder: 1 },
    ]);
    expect(player?.characteristicIncreaseCounts).toEqual({
      ...ZERO_COUNTS,
      agility: 2,
    });
  });

  it('counts a mix of different characteristic-increase markers', () => {
    const player = parsePlayerWithSkillsCell(
      "<span style='color:#006020'> +MA</span>, " +
        "<span style='color:#006020'> +ST</span>, " +
        "<span style='color:#006020'> +AG</span>, " +
        "<span style='color:#006020'> +PA</span>, " +
        "<span style='color:#006020'> +AV</span>",
    );

    expect(player?.skills).toEqual([]);
    expect(player?.characteristicIncreaseCounts).toEqual({
      move: 1,
      strength: 1,
      agility: 1,
      passing: 1,
      armour: 1,
    });
  });

  it('reads a page whose characteristics row has no skills cell as all-zero counts', () => {
    expect(
      parsePlayerWithoutSkillsCell()?.characteristicIncreaseCounts,
    ).toEqual(ZERO_COUNTS);
  });
});

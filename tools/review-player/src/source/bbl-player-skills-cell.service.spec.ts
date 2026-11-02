import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BblPlayerSkillsCellService } from './bbl-player-skills-cell.service';

function page(skillsCell: string): string {
  return (
    '<table>' +
    '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>' +
    `<tr><td>6</td><td>3</td><td>3</td><td>4</td><td>9</td><td>${skillsCell}</td></tr>` +
    '</table>'
  );
}

describe('BblPlayerSkillsCellService', () => {
  let service: BblPlayerSkillsCellService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BblPlayerSkillsCellService],
    }).compile();
    service = moduleRef.get(BblPlayerSkillsCellService);
  });

  it('reads plain text entries as starting skills', () => {
    expect(service.parse(page('Block, Dodge'))?.skills).toEqual([
      {
        name: 'Block',
        attributeValue: null,
        source: 'starting',
        advancementOrder: null,
      },
      {
        name: 'Dodge',
        attributeValue: null,
        source: 'starting',
        advancementOrder: null,
      },
    ]);
  });

  it('reads a coloured span as a gained skill, numbered among gained skills only', () => {
    const cell =
      'Block, <span style="color:#006020">Guard</span>, ' +
      '<span style="color:#006020">Mighty Blow (+1)</span>';

    expect(service.parse(page(cell))?.skills).toEqual([
      {
        name: 'Block',
        attributeValue: null,
        source: 'starting',
        advancementOrder: null,
      },
      {
        name: 'Guard',
        attributeValue: null,
        source: 'gained',
        advancementOrder: 1,
      },
      {
        name: 'Mighty Blow',
        attributeValue: '+1',
        source: 'gained',
        advancementOrder: 2,
      },
    ]);
  });

  it('lists the characteristic-increase markers as increases, not skills', () => {
    const cell =
      '<span style="color:#006020">+MA</span>, ' +
      '<span style="color:#006020">+AG</span>, ' +
      '<span style="color:#006020">+AG</span>, ' +
      '<span style="color:#006020">Guard</span>';
    const parsed = service.parse(page(cell));

    expect(parsed?.skills).toEqual([
      {
        name: 'Guard',
        attributeValue: null,
        source: 'gained',
        advancementOrder: 4,
      },
    ]);
    expect(parsed?.increases).toEqual([
      { characteristic: 'MA', advancementOrder: 1 },
      { characteristic: 'AG', advancementOrder: 2 },
      { characteristic: 'AG', advancementOrder: 3 },
    ]);
  });

  it('numbers increases and gained skills together, and a pending marker takes no number', () => {
    const cell =
      '<span style="color:#006020">Dodge</span>, ' +
      '<span style="color:#006020"> +MA</span>, ' +
      '<span style="color:#006020"> Sprint</span>, ' +
      '<span style="color:#006020"><span style="color:#f02020">?</span></span>';
    const parsed = service.parse(page(cell));

    expect(parsed?.skills.map((skill) => skill.advancementOrder)).toEqual([
      1, 3,
    ]);
    expect(parsed?.increases).toEqual([
      { characteristic: 'MA', advancementOrder: 2 },
    ]);
  });

  it('drops a pending advancement marker', () => {
    const cell =
      'Block, <span style="color:#006020"><span style="color:#f02020">?</span></span>';

    expect(service.parse(page(cell))?.skills).toEqual([
      {
        name: 'Block',
        attributeValue: null,
        source: 'starting',
        advancementOrder: null,
      },
    ]);
  });

  it('returns an empty result for a blank skills cell', () => {
    const parsed = service.parse(page(''));

    expect(parsed?.skills).toEqual([]);
    expect(parsed?.increases).toEqual([]);
  });

  it('skips a decoy row that does not match the characteristics header', () => {
    const parsed = service.parse(
      '<table>' +
        '<tr><th colspan="6">Player Details</th></tr>' +
        '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th><th>Skills</th></tr>' +
        '<tr><td>6</td><td>3</td><td>3</td><td>4</td><td>9</td><td>Block</td></tr>' +
        '</table>',
    );

    expect(parsed?.skills).toEqual([
      {
        name: 'Block',
        attributeValue: null,
        source: 'starting',
        advancementOrder: null,
      },
    ]);
  });

  it('returns null when the page has no characteristics table', () => {
    expect(service.parse('<p>nothing here</p>')).toBeNull();
  });

  it('returns null when the characteristics row has no skills cell', () => {
    expect(
      service.parse(
        '<table>' +
          '<tr><th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th></tr>' +
          '<tr><td>6</td><td>3</td><td>3</td><td>4</td><td>9</td></tr>' +
          '</table>',
      ),
    ).toBeNull();
  });
});

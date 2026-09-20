import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import type { SampledRace } from '../shared/review.types';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawOfficialTeamsIndexService } from '../source/tp-raw-official-teams-index.service';
import { PositionKeywordsRawRendererService } from './position-keywords-raw-renderer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('PositionKeywordsRawRendererService', () => {
  let service: PositionKeywordsRawRendererService;
  let raceIds: MockProxy<RaceExternalIdsService>;
  let tp: MockProxy<TpRawOfficialTeamsIndexService>;
  let manual: MockProxy<ManualRawDataService>;

  beforeEach(async () => {
    raceIds = mock<RaceExternalIdsService>();
    tp = mock<TpRawOfficialTeamsIndexService>();
    manual = mock<ManualRawDataService>();
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: [], name: [] });
    manual.keywords.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionKeywordsRawRendererService,
        { provide: RaceExternalIdsService, useValue: raceIds },
        { provide: TpRawOfficialTeamsIndexService, useValue: tp },
        { provide: ManualRawDataService, useValue: manual },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(PositionKeywordsRawRendererService);
  });

  it('renders TP keyword codes with their curated names per rules set', async () => {
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf-25'], name: [] });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf-25',
      raceName: 'Dwarf',
      rulesSets: ['BB2025'],
      positions: [
        {
          name: 'Zombie',
          isStar: false,
          isOfficial: true,
          rulesSet: 'BB2025',
          tpPositionId: 1,
          characteristics: {
            move: 4,
            strength: 3,
            agility: 2,
            passing: 0,
            armour: 8,
          },
          skills: [],
          keywordCodes: [111, 110],
          specialRuleName: null,
        },
      ],
    });
    manual.keywords.mockResolvedValue([
      { name: 'Goblin', kind: 'species', code: '111' },
      { name: 'Undead', kind: 'species', code: '110' },
    ]);

    const html = await service.render(race);

    expect(html).toContain('<h5>TP</h5>');
    expect(html).toContain('Goblin (111)');
    expect(html).toContain('Undead (110)');
  });

  it('highlights a TP code no curated keyword carries', async () => {
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf-25'], name: [] });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf-25',
      raceName: 'Dwarf',
      rulesSets: ['BB2025'],
      positions: [
        {
          name: 'Zombie',
          isStar: false,
          isOfficial: true,
          rulesSet: 'BB2025',
          tpPositionId: 1,
          characteristics: {
            move: 4,
            strength: 3,
            agility: 2,
            passing: 0,
            armour: 8,
          },
          skills: [],
          keywordCodes: [777],
          specialRuleName: null,
        },
      ],
    });

    const html = await service.render(race);

    expect(html).toContain('class="mismatch"');
    expect(html).toContain('not curated');
    expect(html).toContain('777');
  });

  it('shows "none" for a position TP gives no keyword codes', async () => {
    raceIds.forRace.mockResolvedValue({ bbl: [], tp: ['dwarf-25'], name: [] });
    tp.raceFor.mockResolvedValue({
      teamRaceCode: 'dwarf-25',
      raceName: 'Dwarf',
      rulesSets: ['CRP'],
      positions: [
        {
          name: 'Blocker',
          isStar: false,
          isOfficial: true,
          rulesSet: 'CRP',
          tpPositionId: 1,
          characteristics: {
            move: 4,
            strength: 3,
            agility: 2,
            passing: 0,
            armour: 9,
          },
          skills: [],
          keywordCodes: [],
          specialRuleName: null,
        },
      ],
    });

    const html = await service.render(race);

    expect(html).toContain('<td>Blocker</td><td>CRP</td><td>none</td>');
  });

  it('notes that no raw keyword data exists for the race', async () => {
    tp.raceFor.mockResolvedValue(null);

    const html = await service.render(race);

    expect(html).toBe(
      '<p class="note">No raw keyword data for race &quot;Dwarf&quot;.</p>',
    );
  });
});

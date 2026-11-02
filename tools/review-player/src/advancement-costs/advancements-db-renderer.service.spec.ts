import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type {
  RawIncreaseMatch,
  RawSkillMatch,
} from '../player-advancements/raw-match.types';
import { StoredIncreaseRawMatchService } from '../player-advancements/stored-increase-raw-match.service';
import { StoredSkillRawMatchService } from '../player-advancements/stored-skill-raw-match.service';
import type { SampledPlayer } from '../shared/review.types';
import type {
  AdvancementHistory,
  SpendComparison,
  StoredUnspentCheck,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { AdvancementTableService } from './advancement-table.service';
import { AdvancementsDbRendererService } from './advancements-db-renderer.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';
import { UnspentSppTableService } from './unspent-spp-table.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1020',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

const HISTORY = {
  playerId: 42,
  storedUnspentSpp: 12,
  skills: [],
  increases: [],
} as unknown as AdvancementHistory;
const MODEL = { rulesSetName: 'BB2020' } as UnspentSppModel;
const FIGURE = { source: 'bbl' } as SourceUnspentSppFigure;
const COMPARED: SpendComparison = { kind: 'none' };
const STORED: StoredUnspentCheck = { kind: 'none_stored' };
const SKILLS: RawSkillMatch = { verdicts: new Map(), rawOnly: [] };
const INCREASES: RawIncreaseMatch = { verdicts: new Map(), rawOnly: [] };

describe('AdvancementsDbRendererService', () => {
  let service: AdvancementsDbRendererService;
  let history: MockProxy<PlayerAdvancementHistoryService>;
  let range: MockProxy<AdvancementCostRangeService>;
  let figures: MockProxy<SourceUnspentSppFigureService>;
  let comparison: MockProxy<SourceSpendComparisonService>;
  let storedCheck: MockProxy<StoredUnspentSppCheckService>;
  let skillMatch: MockProxy<StoredSkillRawMatchService>;
  let increaseMatch: MockProxy<StoredIncreaseRawMatchService>;
  let advancementTable: MockProxy<AdvancementTableService>;
  let unspentTable: MockProxy<UnspentSppTableService>;

  beforeEach(async () => {
    history = mock<PlayerAdvancementHistoryService>();
    range = mock<AdvancementCostRangeService>();
    figures = mock<SourceUnspentSppFigureService>();
    comparison = mock<SourceSpendComparisonService>();
    storedCheck = mock<StoredUnspentSppCheckService>();
    skillMatch = mock<StoredSkillRawMatchService>();
    increaseMatch = mock<StoredIncreaseRawMatchService>();
    advancementTable = mock<AdvancementTableService>();
    unspentTable = mock<UnspentSppTableService>();
    history.forPlayers.mockResolvedValue(new Map([[42, HISTORY]]));
    range.model.mockReturnValue(MODEL);
    figures.figureFor.mockResolvedValue(FIGURE);
    comparison.compare.mockReturnValue(COMPARED);
    storedCheck.check.mockReturnValue(STORED);
    storedCheck.disagrees.mockReturnValue(true);
    skillMatch.match.mockResolvedValue(SKILLS);
    increaseMatch.match.mockResolvedValue(INCREASES);
    advancementTable.render.mockReturnValue('[advancements]');
    unspentTable.render.mockReturnValue('[unspent]');
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementsDbRendererService,
        { provide: PlayerAdvancementHistoryService, useValue: history },
        { provide: AdvancementCostRangeService, useValue: range },
        { provide: SourceUnspentSppFigureService, useValue: figures },
        { provide: SourceSpendComparisonService, useValue: comparison },
        { provide: StoredUnspentSppCheckService, useValue: storedCheck },
        { provide: StoredSkillRawMatchService, useValue: skillMatch },
        { provide: StoredIncreaseRawMatchService, useValue: increaseMatch },
        { provide: AdvancementTableService, useValue: advancementTable },
        { provide: UnspentSppTableService, useValue: unspentTable },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(AdvancementsDbRendererService);
  });

  it('returns the advancement table and the unspent-SPP table separately', async () => {
    expect(await service.render(player)).toEqual({
      advancements: '[advancements]',
      unspentSpp: '[unspent]',
    });
  });

  it('builds the advancement table from the model and both raw matches', async () => {
    await service.render(player);

    expect(history.forPlayers).toHaveBeenCalledWith([42]);
    expect(range.model).toHaveBeenCalledWith(HISTORY);
    expect(skillMatch.match).toHaveBeenCalledWith(player, HISTORY.skills);
    expect(increaseMatch.match).toHaveBeenCalledWith(player, HISTORY.increases);
    expect(advancementTable.render).toHaveBeenCalledWith({
      model: MODEL,
      skills: SKILLS,
      increases: INCREASES,
    });
  });

  it('builds the unspent-SPP table from the figure, comparison and stored check', async () => {
    await service.render(player);

    expect(figures.figureFor).toHaveBeenCalledWith(player);
    expect(comparison.compare).toHaveBeenCalledWith(MODEL, FIGURE);
    expect(storedCheck.check).toHaveBeenCalledWith(MODEL, 12, FIGURE);
    expect(storedCheck.disagrees).toHaveBeenCalledWith(STORED);
    expect(unspentTable.render).toHaveBeenCalledWith({
      model: MODEL,
      figure: FIGURE,
      compared: COMPARED,
      stored: STORED,
      storedDisagrees: true,
    });
  });

  it('notes a player id with no row and renders nothing else', async () => {
    history.forPlayers.mockResolvedValue(new Map());

    expect(await service.render(player)).toEqual({
      advancements:
        '<p class="note">No player row with id 42 in the database.</p>',
      unspentSpp: '',
    });
    expect(advancementTable.render).not.toHaveBeenCalled();
  });
});

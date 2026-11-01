import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import type {
  AdvancementKind,
  PlayerSkillSource,
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementPricingModelService } from './advancement-pricing-model.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { StoredUnspentSppSettlementService } from './stored-unspent-spp-settlement.service';
import { UnspentSppService } from './unspent-spp.service';
import type { ModelledUnspentSpp, UnspentSppResult } from './unspent-spp.types';
import { UnspentSppCombinationService } from './unspent-spp-combination.service';

export const CRP = 1;
export const BB2020 = 2;
export const BB2025 = 3;
export const ERA = 20;
export const LEAGUE = 30;
export const POSITION = 10;
export const FAN_FAVOURITE = 500;

/** One row of the players query, as UnspentSppService selects it. */
export interface PlayerRowFixture {
  playerId: number;
  sppTotal: number | null;
  unspentSpp: number | null;
  positionId: number;
  isStarPlayer: boolean;
  eraId: number;
  leagueId: number;
  moveIncreaseCount: number;
  strengthIncreaseCount: number;
  agilityIncreaseCount: number;
  passingIncreaseCount: number;
  armourIncreaseCount: number;
}

export function playerRow(
  overrides: Partial<PlayerRowFixture> = {},
): PlayerRowFixture {
  return {
    playerId: 1,
    sppTotal: 0,
    unspentSpp: null,
    positionId: POSITION,
    isStarPlayer: false,
    eraId: ERA,
    leagueId: LEAGUE,
    moveIncreaseCount: 0,
    strengthIncreaseCount: 0,
    agilityIncreaseCount: 0,
    passingIncreaseCount: 0,
    armourIncreaseCount: 0,
    ...overrides,
  };
}

/** One row of the advancement costs query. */
export interface CostRowFixture {
  rulesSetId: number;
  leagueId: number | null;
  advancementNumber: number;
  advancementKind: AdvancementKind;
  skillId: number | null;
  sppCost: number;
}

/** A rules set's own rows of one kind, numbered from 1. */
export function costsOfKind(
  rulesSetId: number,
  advancementKind: AdvancementKind,
  sppCosts: number[],
): CostRowFixture[] {
  return sppCosts.map((sppCost, index) => ({
    rulesSetId,
    leagueId: null,
    advancementNumber: index + 1,
    advancementKind,
    skillId: null,
    sppCost,
  }));
}

export function crpCosts(): CostRowFixture[] {
  return costsOfKind(CRP, 'table_roll', [6, 10, 15, 20, 25, 100]);
}

export function bb2020Costs(): CostRowFixture[] {
  return [
    ...costsOfKind(BB2020, 'random_primary_skill', [3, 4, 6, 8, 10, 15]),
    ...costsOfKind(BB2020, 'chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
    ...costsOfKind(BB2020, 'random_secondary_skill', [6, 8, 12, 16, 20, 30]),
    ...costsOfKind(BB2020, 'chosen_secondary_skill', [12, 14, 18, 22, 26, 40]),
    ...costsOfKind(BB2020, 'random_characteristic', [18, 20, 24, 28, 32, 50]),
  ];
}

export function bb2025Costs(): CostRowFixture[] {
  return [
    ...costsOfKind(BB2025, 'random_primary_skill', [3, 4, 6, 8, 10, 15]),
    ...costsOfKind(BB2025, 'chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
    ...costsOfKind(BB2025, 'chosen_secondary_skill', [10, 12, 16, 20, 24, 34]),
    ...costsOfKind(BB2025, 'random_characteristic', [14, 16, 20, 24, 28, 38]),
  ];
}

/** tLoEG's house rule under CRP: Fan Favourite as advancement 7, for 125. */
export function fanFavouriteCost(leagueId = LEAGUE): CostRowFixture {
  return {
    rulesSetId: CRP,
    leagueId,
    advancementNumber: 7,
    advancementKind: 'granted_skill',
    skillId: FAN_FAVOURITE,
    sppCost: 125,
  };
}

export interface PlayerSkillFixture {
  playerId: number;
  skillId: number;
  source: PlayerSkillSource;
  isFreeExtra: boolean;
}

/** `count` gained skills of one source, with skill ids from 101. */
export function gainedSkills(
  count: number,
  source: PlayerSkillSource = 'advancement',
  playerId = 1,
): PlayerSkillFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId,
    skillId: 101 + index,
    source,
    isFreeExtra: false,
  }));
}

/** The rows each of UnspentSppService's six queries returns. */
export interface UnspentSppFixture {
  players: PlayerRowFixture[];
  eraRulesSets?: { eraId: number; rulesSetId: number }[];
  playerSkills?: PlayerSkillFixture[];
  skillCategories?: {
    skillId: number;
    rulesSetId: number;
    category: SkillCategory;
  }[];
  positionAccess?: {
    positionId: number;
    rulesSetId: number;
    category: SkillCategory;
    access: SkillAccess;
  }[];
  costs?: CostRowFixture[];
}

/**
 * A mock db answering UnspentSppService's queries in the order it issues them.
 * With no era rules set rows the service stops after query 3, so the last
 * three answers are only supplied when there are some.
 */
export function unspentSppDb(fixture: UnspentSppFixture): MockDbResult {
  const eraRulesSets = fixture.eraRulesSets ?? [];
  const rulesSetAnswers =
    eraRulesSets.length === 0
      ? []
      : [
          fixture.skillCategories ?? [],
          fixture.positionAccess ?? [],
          fixture.costs ?? [],
        ];
  return mockDb(
    fixture.players,
    eraRulesSets,
    fixture.playerSkills ?? [],
    ...rulesSetAnswers,
  );
}

/**
 * The service under test on a mock db. Its five collaborators are pure and
 * dependency-free, so they are passed real as a pure chain (CLAUDE.md).
 */
export async function makeUnspentSppService(
  db: MockDbResult,
): Promise<UnspentSppService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UnspentSppService,
      AdvancementKindCandidatesService,
      AdvancementSpendRangeService,
      AdvancementPricingModelService,
      StoredUnspentSppSettlementService,
      UnspentSppCombinationService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(UnspentSppService);
}

/** Player 1's result for this fixture. */
export async function unspentSppFor(
  fixture: UnspentSppFixture,
): Promise<UnspentSppResult | undefined> {
  const service = await makeUnspentSppService(unspentSppDb(fixture));
  return service.forPlayer(1);
}

/** Player 1's modelled result for this fixture. */
export async function modelledUnspentSppFor(
  fixture: UnspentSppFixture,
  sppTotals?: ReadonlyMap<number, number>,
): Promise<ModelledUnspentSpp | undefined> {
  const service = await makeUnspentSppService(unspentSppDb(fixture));
  return (await service.modelledForPlayers([1], sppTotals)).get(1);
}

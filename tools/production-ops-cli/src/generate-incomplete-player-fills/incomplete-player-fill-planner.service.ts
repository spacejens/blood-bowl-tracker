import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { CharacteristicReductionService } from './characteristic-reduction.service';
import type {
  CandidateRow,
  CharacteristicKey,
  CharacteristicLine,
  EraRulesSetRow,
  FillEntry,
  FillPlan,
  FillPlannerInput,
  FillReport,
  PositionProfile,
  PositionRulesSetRow,
  PositionSkillRow,
  ReductionCounts,
  SkipReason,
  StoredAdvancementRow,
} from './fill-plan.types';
import { SKIP_REASONS } from './fill-plan.types';
import { PositionProfileService } from './position-profile.service';

/** Which characteristic each stat-reduction consequence type lowers. */
const REDUCTION_TYPES: Readonly<Record<string, CharacteristicKey>> = {
  stat_reduction_ma: 'ma',
  stat_reduction_st: 'st',
  stat_reduction_ag: 'ag',
  stat_reduction_pa: 'pa',
  stat_reduction_av: 'av',
};

const DEATH_TYPE = 'death';

/** Skills the free-extra rules make free when gained outside the paid advancements. */
const FREE_EXTRA_SKILL_NAMES: ReadonlySet<string> = new Set([
  'Loner',
  'Hatred',
]);

interface PlannerIndex {
  consequences: Map<number, Map<string, number>>;
  stored: Map<number, StoredAdvancementRow[]>;
  freeSkillRisk: Set<number>;
  ongoingTeams: Set<number>;
  positionRulesSets: Map<string, PositionRulesSetRow[]>;
  positionSkills: Map<number, PositionSkillRow[]>;
  eraRulesSets: Map<number, EraRulesSetRow[]>;
}

type Decision = { entry: FillEntry } | { reason: SkipReason };

interface ContradictionCheck {
  candidate: CandidateRow;
  line: CharacteristicLine;
  stored: StoredAdvancementRow[];
  profile: PositionProfile;
}

interface EntryParts {
  candidate: CandidateRow;
  sppTotal: number;
  line: CharacteristicLine;
  profile: PositionProfile;
  status: PlayerStatus;
}

/**
 * Plans the `incompletePlayerFills` entries for incomplete TP players who
 * provably have no advancements: their total SPP is below the cheapest
 * advancement any rules set of their era prices, so the whole total is
 * unspent. Each entry is the position's line worsened by the player's stat
 * reductions, the position's starting skills and no advancements. Anything
 * not certain is skipped with the first reason that applies, and the
 * skipped players are listed by reason.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class IncompletePlayerFillPlannerService {
  constructor(
    private readonly reduction: CharacteristicReductionService,
    private readonly profiles: PositionProfileService,
  ) {}

  plan(input: FillPlannerInput): FillPlan {
    const index = this.index(input);
    const skipped = Object.fromEntries(
      SKIP_REASONS.map((reason) => [reason, { count: 0, players: [] }]),
    ) as unknown as FillReport['skipped'];
    const entries: FillEntry[] = [];
    const candidates = [...input.candidates].sort(
      (a, b) => Number(a.tpId) - Number(b.tpId) || a.tpId.localeCompare(b.tpId),
    );
    for (const candidate of candidates) {
      const decision = this.decide(candidate, index);
      if ('entry' in decision) {
        entries.push(decision.entry);
      } else {
        skipped[decision.reason].count += 1;
        skipped[decision.reason].players.push(candidate.tpId);
      }
    }
    return {
      entries,
      report: {
        considered: candidates.length,
        eligible: entries.length,
        skipped,
      },
    };
  }

  private decide(candidate: CandidateRow, index: PlannerIndex): Decision {
    if (candidate.isJourneyman) {
      return { reason: 'journeyman' };
    }
    const sppTotal = candidate.sppTotal;
    if (sppTotal === null || sppTotal < 0) {
      return { reason: 'spp-missing' };
    }
    const cheapest = this.cheapestCost(
      index.eraRulesSets.get(candidate.eraId) ?? [],
    );
    if (cheapest === undefined) {
      return { reason: 'era-unpriced' };
    }
    if (sppTotal >= cheapest) {
      return { reason: 'spp-too-high' };
    }
    const stored = index.stored.get(candidate.playerId) ?? [];
    if (
      index.freeSkillRisk.has(candidate.playerId) ||
      stored.some((row) => this.isGainedFreeSkill(row))
    ) {
      return { reason: 'free-skill-risk' };
    }
    const rows =
      index.positionRulesSets.get(
        `${candidate.positionId}|${candidate.eraId}`,
      ) ?? [];
    const profile = this.profiles.resolve({
      rows,
      skills: rows.flatMap(
        (row) => index.positionSkills.get(row.positionRulesSetId) ?? [],
      ),
    });
    if (profile === undefined) {
      return { reason: 'position-ambiguous' };
    }
    const line = this.reduction.apply({
      line: profile.line,
      formats: profile.formats,
      reductions: this.reductions(index.consequences.get(candidate.playerId)),
    });
    if (line === undefined) {
      return { reason: 'invalid-characteristics' };
    }
    if (this.contradicts({ candidate, line, stored, profile })) {
      return { reason: 'stored-data-contradicts' };
    }
    const status = this.status(candidate, index);
    if (status === undefined) {
      return { reason: 'status-unresolved' };
    }
    return {
      entry: this.entry({ candidate, sppTotal, line, profile, status }),
    };
  }

  /** Undefined when the era has no rules set, or one that prices nothing. */
  private cheapestCost(rows: EraRulesSetRow[]): number | undefined {
    const costs: number[] = [];
    for (const row of rows) {
      if (row.cheapestCost === null) {
        return undefined;
      }
      costs.push(row.cheapestCost);
    }
    return costs.length === 0 ? undefined : Math.min(...costs);
  }

  private isGainedFreeSkill(row: StoredAdvancementRow): boolean {
    if (row.source === 'starting' || row.source === 'characteristic') {
      return false;
    }
    return row.isFreeExtra || FREE_EXTRA_SKILL_NAMES.has(row.skillName ?? '');
  }

  private reductions(counts: Map<string, number> | undefined): ReductionCounts {
    const reductions: ReductionCounts = { ma: 0, st: 0, ag: 0, pa: 0, av: 0 };
    for (const [type, count] of counts ?? []) {
      const key = REDUCTION_TYPES[type];
      if (key !== undefined) {
        reductions[key] += count;
      }
    }
    return reductions;
  }

  /**
   * Whether anything already stored would make the fill refuse the entry:
   * a non-zero MA/ST/AG/AV or a stored PA that differs from the line, a
   * stored unspent SPP other than the total, a stored advancement, or a
   * stored starting skill the position does not list.
   */
  private contradicts(check: ContradictionCheck): boolean {
    const { candidate, line, stored, profile } = check;
    const pairs: [number, number][] = [
      [candidate.move, line.ma],
      [candidate.strength, line.st],
      [candidate.agility, line.ag],
      [candidate.armour, line.av],
    ];
    if (pairs.some(([value, entry]) => value !== 0 && value !== entry)) {
      return true;
    }
    if (candidate.passing !== null && candidate.passing !== line.pa) {
      return true;
    }
    if (
      candidate.unspentSpp !== null &&
      candidate.unspentSpp !== candidate.sppTotal
    ) {
      return true;
    }
    return stored.some(
      (row) =>
        row.source !== 'starting' ||
        !profile.skills.some(
          (skill) =>
            skill.skillId === row.skillId &&
            skill.attributeValue === row.attributeValue,
        ),
    );
  }

  private status(
    candidate: CandidateRow,
    index: PlannerIndex,
  ): PlayerStatus | undefined {
    if (candidate.status !== null) {
      return candidate.status;
    }
    const deaths =
      index.consequences.get(candidate.playerId)?.get(DEATH_TYPE) ?? 0;
    if (deaths > 0) {
      return 'dead';
    }
    if (index.ongoingTeams.has(candidate.teamId)) {
      return undefined;
    }
    return 'retired';
  }

  private entry(parts: EntryParts): FillEntry {
    const { candidate, sppTotal, line, profile, status } = parts;
    return {
      player: { system: 'tourplay.net', id: candidate.tpId },
      status,
      characteristics: {
        ma: line.ma,
        st: line.st,
        ag: line.ag,
        ...(line.pa === null ? {} : { pa: line.pa }),
        av: line.av,
      },
      sppTotal,
      unspentSpp: sppTotal,
      startingSkills: profile.skills.map((skill) =>
        skill.attributeValue === null
          ? { system: 'Name', id: skill.nameId }
          : {
              skill: { system: 'Name', id: skill.nameId },
              attributeValue: skill.attributeValue,
            },
      ),
      advancements: [],
    };
  }

  private index(input: FillPlannerInput): PlannerIndex {
    const consequences = new Map<number, Map<string, number>>();
    for (const row of input.consequenceCounts) {
      const byType =
        consequences.get(row.playerId) ?? new Map<string, number>();
      byType.set(
        row.consequenceType,
        (byType.get(row.consequenceType) ?? 0) + row.count,
      );
      consequences.set(row.playerId, byType);
    }
    return {
      consequences,
      stored: this.groupBy(input.storedAdvancements, (row) => row.playerId),
      freeSkillRisk: new Set(input.freeSkillRiskPlayerIds),
      ongoingTeams: new Set(input.ongoingTeamIds),
      positionRulesSets: this.groupBy(
        input.positionRulesSets,
        (row) => `${row.positionId}|${row.eraId}`,
      ),
      positionSkills: this.groupBy(
        input.positionSkills,
        (row) => row.positionRulesSetId,
      ),
      eraRulesSets: this.groupBy(input.eraRulesSets, (row) => row.eraId),
    };
  }

  private groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
    const grouped = new Map<K, T[]>();
    for (const row of rows) {
      const group = grouped.get(key(row)) ?? [];
      group.push(row);
      grouped.set(key(row), group);
    }
    return grouped;
  }
}

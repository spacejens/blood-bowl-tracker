import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import type {
  CandidateRow,
  PositionProfile,
  StageDecision,
  StatReductionEventRow,
  StoredAdvancementRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import { LastingInjuryProofService } from './lasting-injury-proof.service';

export interface InjuryStageInput {
  candidate: CandidateRow;
  /** His stored total, below the cheapest advancement of his era. */
  sppTotal: number;
  status: PlayerStatus;
  reductions: readonly StatReductionEventRow[];
  competitions: readonly TeamCompetitionRow[];
  /** Per rules set of his era, whether lasting injuries never heal under it. */
  rulesSetsNeverHeal: readonly boolean[];
  /** When he died; null when no death is recorded. */
  diedAt: string | null;
  stored: readonly StoredAdvancementRow[];
  profile: PositionProfile | undefined;
}

/**
 * Decides the fill of a player too low on SPP to have advanced who has
 * recorded stat reductions. They are applied to his position's line only
 * when they certainly still apply (LastingInjuryProofService), within each
 * characteristic's floor and reduction cap; the line must then be valid and
 * nothing stored may contradict the entry. The rest is as for a player
 * without reductions: no advancements and the whole total unspent. The
 * checks run in a fixed order and the first that fails is the reason
 * reported.
 */
@Injectable()
export class InjuryFillStageService {
  constructor(
    private readonly proof: LastingInjuryProofService,
    private readonly changes: CharacteristicChangeService,
    private readonly validity: CharacteristicValidityService,
    private readonly entries: FillEntryBuilderService,
  ) {}

  decide(input: InjuryStageInput): StageDecision {
    const reductions = this.proof.prove({
      reductions: input.reductions,
      competitions: input.competitions,
      rulesSetsNeverHeal: input.rulesSetsNeverHeal,
      diedAt: input.diedAt,
    });
    if (reductions === undefined) {
      return { reason: 'lasting-injury-uncertain' };
    }
    const profile = input.profile;
    if (profile === undefined) {
      return { reason: 'position-ambiguous' };
    }
    const line = this.changes.reduce({
      line: profile.line,
      formats: profile.formats,
      reductions,
    });
    if (!this.validity.isValid({ line, formats: profile.formats })) {
      return { reason: 'invalid-characteristics' };
    }
    const { candidate, stored, sppTotal } = input;
    if (
      this.entries.contradicts({
        candidate,
        stored,
        profile,
        line,
        unspentSpp: sppTotal,
      })
    ) {
      return { reason: 'stored-data-contradicts' };
    }
    return {
      entry: this.entries.build({
        candidate,
        line,
        profile,
        sppTotal,
        unspentSpp: sppTotal,
        status: input.status,
        advancements: [],
      }),
    };
  }
}

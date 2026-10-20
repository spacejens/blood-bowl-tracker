import type { ExternalId, ImportError } from '@blood-bowl-tracker/api-contract';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpUpsertRunnerService } from './tp-upsert-runner.service';

/** Options for {@link TpSkillIdLookupService.resolveByTpId}. */
export interface ResolveSkillIdsByTpIdOptions {
  /** TP skillMasterIds to look up, in the order to look them up. */
  masterIds: readonly number[];
  tpSystemId: number;
  errors: ImportError[];
}

/**
 * How this package turns TP skillMasterIds into skills, shared by the roster
 * players' skills (TpRosterSkillIdsService) and the official team list's
 * starting skills (TpOfficialSkillRefsService). TP assigns one skill a new
 * id per rules set, so a skill upserted by name registers every TP id seen
 * for that name. An id with no name is looked up through a skill already
 * carrying it as a TP external id.
 */
@Injectable()
export class TpSkillIdLookupService {
  constructor(
    private readonly skills: SkillsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /** Skill name -> every TP id the masters give that name, in first-seen order. */
  tpIdsByName(
    masters: Iterable<readonly [number, { name: string }]>,
  ): Map<string, Set<number>> {
    const byName = new Map<string, Set<number>>();
    for (const [masterId, { name }] of masters) {
      let ids = byName.get(name);
      if (ids === undefined) {
        ids = new Set();
        byName.set(name, ids);
      }
      ids.add(masterId);
    }
    return byName;
  }

  /** Each id as a TP external id. */
  tpExternalIds(masterIds: Iterable<number>, tpSystemId: number): ExternalId[] {
    return [...masterIds].map((masterId) => ({
      externalSystemId: tpSystemId,
      externalId: String(masterId),
    }));
  }

  /**
   * skillMasterId -> skill id for every id a skill carries as a TP external
   * id, in one batched lookup; ids no skill carries are left out. Undefined
   * when the lookup itself failed, which is reported here, once.
   */
  async resolveByTpId({
    masterIds,
    tpSystemId,
    errors,
  }: ResolveSkillIdsByTpIdOptions): Promise<Map<number, number> | undefined> {
    const skillIds = new Map<number, number>();
    if (masterIds.length === 0) {
      return skillIds;
    }
    const results = await this.runner.record({
      run: () =>
        this.skills.resolveBatch(this.tpExternalIds(masterIds, tpSystemId)),
      item: { skillMasterIds: masterIds },
      errors,
      buildErrorMessage: (error) =>
        `Failed to resolve TP skill ids by external id: ${this.runner.messageOf(error)}`,
    });
    if (results === undefined) {
      return undefined;
    }
    masterIds.forEach((masterId, index) => {
      const result = results[index];
      if (result.found) {
        skillIds.set(masterId, result.id);
      }
    });
    return skillIds;
  }
}

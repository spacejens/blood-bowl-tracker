import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  players,
  playerSkills,
  positionRulesSets,
  positionRulesSetSkills,
  skillRulesSets,
  sql,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const DIFFERENT_STARTING = 'starting-skills-differ-from-position';
const ELITE = 'gained-elite-skill';
const RANDOM = 'randomly-rolled-skill';
const CHOSEN = 'freely-chosen-skill';

/**
 * Four strata, each oversampling a different interesting advancement case
 * rather than only suspect data.
 *
 * A stratifier only ever sees the database — it cannot read a raw source file
 * — so "differs from the raw source" cannot be a stratum. The closest
 * DB-expressible signal is the first one: a player whose STARTING skills
 * differ from the set their position carries under the era's rules set. A
 * starting skill set is copied from the position, so a difference is either a
 * mis-parsed player page or a position whose own skills are wrong — and
 * either is worth a human's eyes.
 *
 * The other three simply guarantee that a run contains elite, randomly rolled
 * and freely chosen gained skills at all: each is rare, each exercises a
 * different importer path, and none of them is by itself a defect.
 *
 * The rules set is the era's LAST-LISTED one, the same insertion-order
 * heuristic `PlayerAdvancementsDbRendererService` and the characteristics
 * stratifier already use, and for the same reason: this tool must not read
 * the importers' configs.
 */
@Injectable()
export class PlayerAdvancementsStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: DIFFERENT_STARTING,
      label: "Player whose stored starting skills differ from their position's",
      sources: ['bbl', 'tp'],
    },
    {
      id: ELITE,
      label: 'Player gained an elite skill',
      sources: ['bbl', 'tp'],
    },
    {
      id: RANDOM,
      label: 'Player gained a randomly rolled skill',
      sources: ['bbl', 'tp'],
    },
    {
      id: CHOSEN,
      label: 'Player gained a freely chosen skill',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
    @Inject(DB) private readonly db: Db,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    const condition = this.filterFor(stratumId);
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(condition)
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  private filterFor(stratumId: string): SQL {
    if (stratumId === DIFFERENT_STARTING) {
      return this.startingSkillsDiffer();
    }
    if (stratumId === ELITE) {
      return this.hasGainedSkill(sql`and ${skillRulesSets.isElite} = true`);
    }
    if (stratumId === RANDOM) {
      return this.hasGainedSkill(sql`and ps.source = 'random'`);
    }
    if (stratumId === CHOSEN) {
      return this.hasGainedSkill(sql`and ps.source = 'chosen'`);
    }
    throw new Error(
      `Unknown player stratum "${stratumId}". Known strata: ` +
        `${DIFFERENT_STARTING}, ${ELITE}, ${RANDOM}, ${CHOSEN}.`,
    );
  }

  /**
   * At least one gained skill matching `extra`, resolved against the era's
   * last-listed rules set so the elite flag means what it means under the
   * rules the player actually played.
   */
  private hasGainedSkill(extra: SQL): SQL {
    return sql`exists (
      select 1
      from ${playerSkills} ps
      left join ${skillRulesSets}
        on ${skillRulesSets.skillId} = ps.skill_id
       and ${skillRulesSets.rulesSetId} = (
         select ${eraRulesSets.rulesSetId}
         from ${eraRulesSets}
         where ${eraRulesSets.eraId} = ${teamEras.eraId}
         order by ${eraRulesSets.id} desc
         limit 1
       )
      where ps.player_id = ${players.id}
        and ps.source <> 'starting'
        ${extra}
    )`;
  }

  /**
   * The player's stored starting-skill id set against their position's, both
   * as sorted arrays. `is distinct from` because one side being empty and the
   * other not is exactly the difference this stratum looks for.
   */
  private startingSkillsDiffer(): SQL {
    return sql`(
      select coalesce(array_agg(ps.skill_id order by ps.skill_id), '{}')
      from ${playerSkills} ps
      where ps.player_id = ${players.id} and ps.source = 'starting'
    ) is distinct from (
      select coalesce(array_agg(prss.skill_id order by prss.skill_id), '{}')
      from ${positionRulesSets} prs
      join ${positionRulesSetSkills} prss
        on prss.position_rules_set_id = prs.id
      where prs.position_id = ${players.positionId}
        and prs.rules_set_id = (
          select ${eraRulesSets.rulesSetId}
          from ${eraRulesSets}
          where ${eraRulesSets.eraId} = ${teamEras.eraId}
          order by ${eraRulesSets.id} desc
          limit 1
        )
    )`;
  }
}

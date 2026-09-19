import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ManualDataReader } from '../data-file/manual-data-reader.service';
import { CoachesProcessor } from '../entities/coaches.processor';
import { CompetitionGroupsProcessor } from '../entities/competition-groups.processor';
import { CompetitionsProcessor } from '../entities/competitions.processor';
import { ErasProcessor } from '../entities/eras.processor';
import { ExternalSystemsProcessor } from '../entities/external-systems.processor';
import { KeywordsProcessor } from '../entities/keywords.processor';
import { LeaguesProcessor } from '../entities/leagues.processor';
import { PositionRulesSetSkillsProcessor } from '../entities/position-rules-set-skills.processor';
import { PositionRulesSetsProcessor } from '../entities/position-rules-sets.processor';
import { PositionsProcessor } from '../entities/positions.processor';
import { RacesProcessor } from '../entities/races.processor';
import { RulesSetsProcessor } from '../entities/rules-sets.processor';
import { SkillRulesSetsProcessor } from '../entities/skill-rules-sets.processor';
import { SkillsProcessor } from '../entities/skills.processor';
import { SppAwardValuesProcessor } from '../entities/spp-award-values.processor';
import { TeamsProcessor } from '../entities/teams.processor';
import { TrophiesProcessor } from '../entities/trophies.processor';
import { TrophyAwardsProcessor } from '../entities/trophy-awards.processor';
import type { ProcessContext } from '../references/process-context';

@Injectable()
export class ManualImportService {
  constructor(
    private readonly reader: ManualDataReader,
    private readonly externalSystems: ExternalSystemsProcessor,
    private readonly rulesSets: RulesSetsProcessor,
    private readonly skills: SkillsProcessor,
    private readonly skillRulesSets: SkillRulesSetsProcessor,
    private readonly keywords: KeywordsProcessor,
    private readonly leagues: LeaguesProcessor,
    private readonly eras: ErasProcessor,
    private readonly races: RacesProcessor,
    private readonly positions: PositionsProcessor,
    private readonly positionRulesSets: PositionRulesSetsProcessor,
    private readonly positionRulesSetSkills: PositionRulesSetSkillsProcessor,
    private readonly coaches: CoachesProcessor,
    private readonly teams: TeamsProcessor,
    private readonly competitionGroups: CompetitionGroupsProcessor,
    private readonly competitions: CompetitionsProcessor,
    private readonly sppAwardValues: SppAwardValuesProcessor,
    private readonly trophies: TrophiesProcessor,
    private readonly trophyAwards: TrophyAwardsProcessor,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Read and pool every `.json5` file in `dir`, bootstrap the external systems
   * it references, then process each entity section in dependency order —
   * rulesSets, skills, skillRulesSets, keywords, leagues, eras, races,
   * positions, positionRulesSets, positionRulesSetSkills, coaches, teams,
   * competitionGroups, competitions, sppAwardValues, trophies, trophyAwards —
   * with skills and skillRulesSets running right after rulesSets, since
   * skills need only the rules sets and running them early keeps the
   * category table available to everything after, positionRulesSets running
   * after both rulesSets and positions (which its entries reference),
   * positionRulesSetSkills running right after positionRulesSets and skills
   * (the API rejects a starting skill whose position has no characteristics
   * under that rules set, or whose skill has no category row there),
   * keywords        -- the BB2025 keyword catalogue. Position keywords are
   *                      written by tools/import-tp, which resolves each of
   *                      TP's numeric codes against the tourplay.net external
   *                      id curated here, so the catalogue must exist before
   *                      that later, separate invocation runs. Nothing in this
   *                      file references a keyword, so its position relative to
   *                      the other sections is otherwise free.
   * competitionGroups running after leagues (whose
   * external ids its entries reference) and before competitions and trophies
   * (which resolve the groups it upserts, by their "Name"-system external
   * id), sppAwardValues running after rulesSets and races (which it
   * references), trophies running after the leagues it may also reference,
   * and trophyAwards last of all, after the trophies whose curated names its
   * entries quote — sharing one error collector so one bad entry never aborts
   * the rest. Reference-resolution
   * and upsert failures are collected; a missing directory, malformed file,
   * or unreachable API throws out of here to be reported as an unexpected
   * failure. A same-kind
   * external-id collision is detected server-side: the API's upsert reports
   * it as a CONFLICT, collected like any other ImportError.
   */
  async run(dir: string): Promise<ImportResult> {
    const data = await this.reader.read(dir);
    const systemIds = await this.externalSystems.bootstrap(data);

    const errors: ImportError[] = [];
    const ctx: ProcessContext = {
      data,
      systemIds,
      errors,
    };

    let imported = 0;
    imported += await this.rulesSets.process(ctx);
    imported += await this.skills.process(ctx);
    imported += await this.skillRulesSets.process(ctx);
    imported += await this.keywords.process(ctx);
    imported += await this.leagues.process(ctx);
    imported += await this.eras.process(ctx);
    imported += await this.races.process(ctx);
    imported += await this.positions.process(ctx);
    imported += await this.positionRulesSets.process(ctx);
    imported += await this.positionRulesSetSkills.process(ctx);
    imported += await this.coaches.process(ctx);
    imported += await this.teams.process(ctx);
    imported += await this.competitionGroups.process(ctx);
    imported += await this.competitions.process(ctx);
    imported += await this.sppAwardValues.process(ctx);
    imported += await this.trophies.process(ctx);
    imported += await this.trophyAwards.process(ctx);

    return this.importResults.result({ imported, errors });
  }
}

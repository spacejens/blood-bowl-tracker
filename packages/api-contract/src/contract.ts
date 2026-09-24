import { oc } from '@orpc/contract';
import { z } from 'zod';

import { batchUpsertProcedure } from './batch-upsert-procedure';
import {
  resolveBatchProcedure,
  resolveProcedure,
  ResolveResultSchema,
} from './resolve-procedure';
import { CoachSchema, UpsertCoachSchema } from './schemas/coach';
import {
  CompetitionSchema,
  UpsertCompetitionSchema,
} from './schemas/competition';
import {
  CompetitionGroupSchema,
  UpsertCompetitionGroupSchema,
} from './schemas/competition-group';
import { EraSchema, UpsertEraSchema } from './schemas/era';
import {
  ExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';
import {
  KeywordCatalogEntrySchema,
  KeywordSchema,
  ListKeywordsSchema,
  UpsertKeywordSchema,
} from './schemas/keyword';
import { LeagueSchema, UpsertLeagueSchema } from './schemas/league';
import {
  MatchSchema,
  ResolveMatchOutcomesResultSchema,
  ResolveMatchOutcomesSchema,
  UpsertMatchSchema,
} from './schemas/match';
import {
  MatchEventSchema,
  UpsertMatchEventSchema,
} from './schemas/match-event';
import {
  PlayerSchema,
  SyncLastingInjuryHistoryResultSchema,
  SyncLastingInjuryHistorySchema,
  SyncReportedSppAdjustmentsSchema,
  SyncScrapedSppAdjustmentsSchema,
  SyncSppAdjustmentsResultSchema,
  UpsertPlayerSchema,
} from './schemas/player';
import {
  ListPlayerSkillsSchema,
  PlayerSkillRefSchema,
  SyncPlayerSkillsResultSchema,
  SyncPlayerSkillsSchema,
} from './schemas/player-skill';
import {
  PositionSchema,
  SyncPositionRaceErasResultSchema,
  SyncPositionRaceErasSchema,
  UpsertPositionSchema,
} from './schemas/position';
import {
  SyncPositionRulesSetsResultSchema,
  SyncPositionRulesSetsSchema,
} from './schemas/position-rules-set';
import {
  ListPositionRulesSetKeywordsSchema,
  PositionRulesSetKeywordRefSchema,
  SyncPositionRulesSetKeywordsResultSchema,
  SyncPositionRulesSetKeywordsSchema,
} from './schemas/position-rules-set-keyword';
import {
  ListPositionRulesSetSkillsSchema,
  PositionRulesSetSkillRefSchema,
  SyncPositionRulesSetSkillsResultSchema,
  SyncPositionRulesSetSkillsSchema,
} from './schemas/position-rules-set-skill';
import { RaceSchema, UpsertRaceSchema } from './schemas/race';
import { RulesSetSchema, UpsertRulesSetSchema } from './schemas/rules-set';
import { SkillSchema, UpsertSkillSchema } from './schemas/skill';
import {
  ListSkillRulesSetsSchema,
  SkillRulesSetCategorySchema,
  SyncSkillRulesSetsResultSchema,
  SyncSkillRulesSetsSchema,
} from './schemas/skill-rules-set';
import {
  SyncSppAwardValuesResultSchema,
  SyncSppAwardValuesSchema,
} from './schemas/spp-award-value';
import { TeamSchema, UpsertTeamSchema } from './schemas/team';
import {
  ImportTpMatchSchema,
  TpMatchImportResultSchema,
} from './schemas/tp-match';
import {
  ImportTpRosterSchema,
  TpRosterImportResultSchema,
} from './schemas/tp-roster';
import {
  ResolveTrophyByNameSchema,
  TrophySchema,
  UpsertTrophySchema,
} from './schemas/trophy';
import {
  TrophyAwardSchema,
  UpsertTrophyAwardSchema,
} from './schemas/trophy-award';
import {
  ComputeMissingTrophyAwardsResultSchema,
  ComputeMissingTrophyAwardsSchema,
} from './schemas/trophy-award-rule';
import {
  upsertProcedure,
  upsertProcedureBadRequestOnly,
  upsertProcedureWithoutConflict,
} from './upsert-procedure';

export const contract = {
  coaches: {
    upsert: upsertProcedure(UpsertCoachSchema, CoachSchema),
    upsertBatch: batchUpsertProcedure(UpsertCoachSchema, CoachSchema),
    // Resolve an external-id pair to this entity's database id. Present on
    // every entity kind an import tool references by external id across
    // files, phases or tools; see docs/api/rpc-conventions.md.
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  leagues: {
    upsert: upsertProcedure(UpsertLeagueSchema, LeagueSchema),
    upsertBatch: batchUpsertProcedure(UpsertLeagueSchema, LeagueSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  races: {
    upsert: upsertProcedure(UpsertRaceSchema, RaceSchema),
    upsertBatch: batchUpsertProcedure(UpsertRaceSchema, RaceSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  players: {
    upsert: upsertProcedure(UpsertPlayerSchema, PlayerSchema),
    upsertBatch: batchUpsertProcedure(UpsertPlayerSchema, PlayerSchema),
    // Not upserts: these recompute already-imported players' SPP columns in
    // place, so there is no external-id conflict to detect and no
    // entity+created shape to return — only the ids actually written. Same
    // shape as positions.syncRaceEras.
    syncScrapedSppAdjustments: oc
      .input(SyncScrapedSppAdjustmentsSchema)
      .output(SyncSppAdjustmentsResultSchema),
    syncReportedSppAdjustments: oc
      .input(SyncReportedSppAdjustmentsSchema)
      .output(SyncSppAdjustmentsResultSchema),
    // Also not an upsert: this manufactures the players_history versions a
    // freshly-inserted player needs for an injury healed before this run,
    // reading match_events the importer has already written. Must be called
    // AFTER the matchEvents step — the accumulated data does not exist until
    // then — which is why it is a separate procedure rather than part of
    // players.upsert.
    syncLastingInjuryHistory: oc
      .input(SyncLastingInjuryHistorySchema)
      .output(SyncLastingInjuryHistoryResultSchema),
    // Players became resolvable when tools/import-manual gained a curated
    // trophy-awards file: a manually curated award names its winning player
    // by external id, across tools and phases, exactly like every other
    // cross-reference.
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  positions: {
    upsert: upsertProcedure(UpsertPositionSchema, PositionSchema),
    upsertBatch: batchUpsertProcedure(UpsertPositionSchema, PositionSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
    // Not an upsert: this adds position-race-era availability links without
    // ever removing or overwriting existing ones (see
    // PositionsService.syncRaceEras), so there's no conflict to detect and
    // no entity+created shape to return — just the resulting link ids.
    syncRaceEras: oc
      .input(SyncPositionRaceErasSchema)
      .output(SyncPositionRaceErasResultSchema),
  },
  positionRulesSets: {
    // Not an upsert: a position's characteristics row is keyed by
    // (positionId, rulesSetId) rather than external ids, so there is no
    // external-id conflict to detect and no entity+created shape to return,
    // only the resulting row ids — same shape as sppAwardValues.sync.
    // BAD_REQUEST is declared because the server rejects characteristics that
    // disagree with the rules set's declared formats (a supplied Passing for
    // a rules set that has none, or a missing one where the rules set
    // requires it); that is authored-data feedback the importer reports per
    // entry, not a server fault.
    sync: oc
      .input(SyncPositionRulesSetsSchema)
      .errors({
        BAD_REQUEST: {
          message: "Characteristics do not match the rules set's formats",
        },
      })
      .output(SyncPositionRulesSetsResultSchema),
  },
  skills: {
    upsert: upsertProcedure(UpsertSkillSchema, SkillSchema),
    upsertBatch: batchUpsertProcedure(UpsertSkillSchema, SkillSchema),
    // Resolvable like every other entity an import tool references by
    // external id across files, phases or tools — a starting-skill sync
    // names its skills by id, which the caller got from here.
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  skillRulesSets: {
    // Not an upsert: a skill's category row is keyed by (skillId,
    // rulesSetId) rather than external ids, so there is no external-id
    // conflict to detect and no entity+created shape to return, only the
    // resulting row ids — same shape as positionRulesSets.sync.
    // BAD_REQUEST is declared because the server rejects a batch naming the
    // same (skill, rules set) pair twice: those two entries would otherwise
    // both take the insert path and collide on the table's unique
    // constraint, turning an authoring mistake into a raw database error.
    sync: oc
      .input(SyncSkillRulesSetsSchema)
      .errors({
        BAD_REQUEST: {
          message: 'Skill rules-set entries are not valid',
        },
      })
      .output(SyncSkillRulesSetsResultSchema),
    // Read-only, so it declares no errors — like competitionGroups.list. One
    // skill per call: the caller already holds the skill id from its own
    // `skills.upsert` response.
    list: oc
      .input(ListSkillRulesSetsSchema)
      .output(z.array(SkillRulesSetCategorySchema)),
  },
  positionRulesSetSkills: {
    // Not an upsert, for the same reason positionRulesSets.sync is not.
    // BAD_REQUEST is declared because the server rejects an entry naming a
    // skill with no skill_rules_sets row for that rules set, and one whose
    // position/rules-set pair has no position_rules_sets row yet; both are
    // authored-data feedback the importer reports per entry, not a server
    // fault — matching how positionRulesSets.sync reports a characteristics
    // format mismatch.
    sync: oc
      .input(SyncPositionRulesSetSkillsSchema)
      .errors({
        BAD_REQUEST: {
          message: 'Starting skills do not match the rules set',
        },
      })
      .output(SyncPositionRulesSetSkillsResultSchema),
    // Read-only, so it declares no errors. The service's rows also carry the
    // rules set's and the skill's names; the output schema carries neither,
    // so those never reach the caller.
    list: oc
      .input(ListPositionRulesSetSkillsSchema)
      .output(z.array(PositionRulesSetSkillRefSchema)),
  },
  keywords: {
    upsert: upsertProcedure(UpsertKeywordSchema, KeywordSchema),
    upsertBatch: batchUpsertProcedure(UpsertKeywordSchema, KeywordSchema),
    // Resolvable like every other entity an import tool references by
    // external id across files, phases or tools.
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
    // Read-only, so it declares no errors — like competitionGroups.list. The
    // whole catalogue in one call: a caller that holds only numeric codes
    // cannot name a keyword from its own data, and the catalogue is small and
    // changes only by curation.
    list: oc
      .input(ListKeywordsSchema)
      .output(z.array(KeywordCatalogEntrySchema)),
  },
  positionRulesSetKeywords: {
    // Not an upsert, for the same reason positionRulesSetSkills.sync is not.
    // BAD_REQUEST is declared because the server rejects an entry whose
    // position/rules-set pair has no position_rules_sets row yet, and a batch
    // naming the same triple twice — both authored-data feedback the importer
    // reports per entry, not a server fault.
    sync: oc
      .input(SyncPositionRulesSetKeywordsSchema)
      .errors({
        BAD_REQUEST: {
          message: 'Position keywords are not valid',
        },
      })
      .output(SyncPositionRulesSetKeywordsResultSchema),
    // Read-only, so it declares no errors.
    list: oc
      .input(ListPositionRulesSetKeywordsSchema)
      .output(z.array(PositionRulesSetKeywordRefSchema)),
  },
  playerSkills: {
    // Not an upsert, for the same reason positionRulesSetSkills.sync is not:
    // the row is keyed by its natural (player, skill, attribute value) triple
    // rather than external ids. BAD_REQUEST is declared because the server
    // rejects an entry naming a player or skill that does not exist, and a
    // batch repeating the same natural key — authored-data feedback the
    // caller reports per entry, not a server fault.
    sync: oc
      .input(SyncPlayerSkillsSchema)
      .errors({
        BAD_REQUEST: {
          message: 'Player skill entries are not valid',
        },
      })
      .output(SyncPlayerSkillsResultSchema),
    // Read-only, so it declares no errors. The service's rows also carry the
    // skill's name; the output schema does not, so it never reaches the
    // caller.
    list: oc
      .input(ListPlayerSkillsSchema)
      .output(z.array(PlayerSkillRefSchema)),
  },
  rulesSets: {
    upsert: upsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
    upsertBatch: batchUpsertProcedure(UpsertRulesSetSchema, RulesSetSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  sppAwardValues: {
    // Not an upsert: an award value has no external ids — it is keyed by
    // (rulesSetId, raceId, actionType) — so there is no conflict to detect
    // and no entity+created shape to return, only the resulting row ids.
    sync: oc
      .input(SyncSppAwardValuesSchema)
      .output(SyncSppAwardValuesResultSchema),
  },
  eras: {
    upsert: upsertProcedure(UpsertEraSchema, EraSchema),
    upsertBatch: batchUpsertProcedure(UpsertEraSchema, EraSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  competitions: {
    upsert: upsertProcedure(UpsertCompetitionSchema, CompetitionSchema),
    upsertBatch: batchUpsertProcedure(
      UpsertCompetitionSchema,
      CompetitionSchema,
    ),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  competitionGroups: {
    // Deliberately no `upsertBatch`: the only caller is tools/import-manual
    // with 16 curated rows, so batching saves nothing (same reasoning as
    // `trophies`).
    upsert: upsertProcedure(
      UpsertCompetitionGroupSchema,
      CompetitionGroupSchema,
    ),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
    // The one read procedure in this contract. tools/import-tp's awards
    // import holds a competition's competitionGroupId (from its own
    // competition upsert's response) but needs the group's curated *name* to
    // build a trophy's TP external id; `upsert` cannot answer that, because
    // the name is its input. The catalog is 16 rows, so the whole list is
    // returned unfiltered and mapped once per import run. Input is an empty
    // object rather than no input at all, so the generated client call site
    // is unambiguous (`list({})`).
    list: oc.input(z.object({})).output(z.array(CompetitionGroupSchema)),
  },
  matches: {
    upsert: upsertProcedure(UpsertMatchSchema, MatchSchema),
    upsertBatch: batchUpsertProcedure(UpsertMatchSchema, MatchSchema),
    // Not an upsert: this recomputes an already-imported competition's match
    // scores and winners in place, so there is no entity+created shape to
    // return and no external-id conflict to detect. Matches it cannot resolve
    // come back in `unresolvedMatchIds` rather than as a thrown error, so one
    // bad match does not cost the competition its other outcomes.
    resolveOutcomes: oc
      .input(ResolveMatchOutcomesSchema)
      .output(ResolveMatchOutcomesResultSchema),
  },
  matchEvents: {
    upsert: upsertProcedure(UpsertMatchEventSchema, MatchEventSchema),
    upsertBatch: batchUpsertProcedure(UpsertMatchEventSchema, MatchEventSchema),
  },
  teams: {
    upsert: upsertProcedure(UpsertTeamSchema, TeamSchema),
    upsertBatch: batchUpsertProcedure(UpsertTeamSchema, TeamSchema),
    resolve: resolveProcedure(),
    resolveBatch: resolveBatchProcedure(),
  },
  trophies: {
    // Deliberately no `upsertBatch`: the only caller is tools/import-manual
    // with 29 curated rows, so batching saves nothing. Same reasoning as
    // `sppAwardValues`, which likewise defines a non-standard router.
    upsert: upsertProcedure(UpsertTrophySchema, TrophySchema),
    // Deliberately by *name*, not the external-id `resolve` every other
    // resolvable entity exposes: trophies carry no shared "Name"-system id,
    // because same-named trophies across competition tiers are genuinely
    // different rows. `tools/import-manual`'s curated trophy awards are
    // hand-authored alongside `trophies.json5` itself, so the exact curated
    // name is the identity they already have to spell correctly. Answers with
    // the same `{found, id}` shape as `resolve`, and for the same reason: a
    // name no trophy carries is an authoring typo, not a server fault.
    resolveByName: oc
      .input(ResolveTrophyByNameSchema)
      .output(ResolveResultSchema),
  },
  trophyAwards: {
    // Deliberately no `upsertBatch`: the whole BBL mirror yields under 400
    // award rows per run, so batching saves nothing. Same reasoning as
    // `trophies` and `competitionGroups`.
    //
    // No CONFLICT error: `trophy_awards` carries a database unique constraint
    // on its natural key (trophy, competition, team era, player), so the
    // dedup lookup can never match more than one row. BAD_REQUEST stays,
    // for an award whose player id does not fit the trophy's recipient kind
    // (see TrophyAwardsService).
    upsert: upsertProcedureBadRequestOnly(
      UpsertTrophyAwardSchema,
      TrophyAwardSchema,
    ),
    // Not an upsert: this computes the awards the source importer could not
    // record, from statistics already imported for the competition, so there
    // is no entity+created shape to return and no external-id conflict to
    // detect. Mirrors `matches.resolveOutcomes`.
    computeMissing: oc
      .input(ComputeMissingTrophyAwardsSchema)
      .output(ComputeMissingTrophyAwardsResultSchema),
  },
  externalSystems: {
    // The only upsert with no CONFLICT error: an external system is matched
    // by name alone (see ExternalSystemsService.upsert), so there's no
    // possibility of multiple existing rows to conflict between.
    upsert: upsertProcedureWithoutConflict(
      UpsertExternalSystemSchema,
      ExternalSystemSchema,
    ),
    // Uses the same builder as every other entity: batch results carry
    // failures as per-item error strings, so there is no CONFLICT error to
    // omit here.
    upsertBatch: batchUpsertProcedure(
      UpsertExternalSystemSchema,
      ExternalSystemSchema,
    ),
  },
  tpRosters: {
    // A coarse, TP-specific import rather than an entity upsert: the server
    // parses one raw TP roster and upserts its team and players in-process,
    // so a client never orchestrates the individual upserts itself. Each
    // failure comes back in the result's ImportResults, so it declares no
    // errors. Safe to retry: everything it writes is an upsert.
    import: oc.input(ImportTpRosterSchema).output(TpRosterImportResultSchema),
  },
  tpMatches: {
    // A coarse, TP-specific import, like tpRosters.import: the server parses
    // one raw TP match and imports its row, team participation, events and
    // outcome in-process, resolving its competition, teams and players by TP
    // id. Each failure comes back in the result's per-stage ImportResults,
    // so it declares no errors. Safe to retry: everything it writes is an
    // upsert or an append-only sync.
    import: oc.input(ImportTpMatchSchema).output(TpMatchImportResultSchema),
  },
};

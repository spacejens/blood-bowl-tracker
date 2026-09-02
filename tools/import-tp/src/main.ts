#!/usr/bin/env node

import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type {
  TpInducedStarPlayer,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { TpCoachesImportService } from './coaches/tp-coaches-import.service';
import { TpCompetitionIdResolverService } from './competitions/tp-competition-id-resolver.service';
import { TpCompetitionsImportService } from './competitions/tp-competitions-import.service';
import { TpErasImportService } from './eras/tp-eras-import.service';
import { TpLeaguesImportService } from './leagues/tp-leagues-import.service';
import { TpMatchEventsImportService } from './match-events/tp-match-events-import.service';
import { TpMatchOutcomesImportService } from './matches/tp-match-outcomes-import.service';
import { TpMatchesImportService } from './matches/tp-matches-import.service';
import { TpPlayersImportService } from './players/tp-players-import.service';
import { TpSppAdjustmentsImportService } from './players/tp-spp-adjustments-import.service';
import { TpPositionCharacteristicsImportService } from './positions/tp-position-characteristics-import.service';
import { TpPositionRaceErasImportService } from './positions/tp-position-race-eras-import.service';
import { TpPositionsImportService } from './positions/tp-positions-import.service';
import { TpRacesImportService } from './races/tp-races-import.service';
import { TpRulesSetsImportService } from './rules-sets/tp-rules-sets-import.service';
import { RosterCollectionService } from './source/roster-collection.service';
import { TpTeamParticipationImportService } from './team-participation/tp-team-participation-import.service';
import { TpTeamsImportService } from './teams/tp-teams-import.service';
import { TpTrophyAwardsImportService } from './trophy-awards/tp-trophy-awards-import.service';

async function run(): Promise<ImportResult> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    // Bootstrap order still matters: the league and rule sets must be
    // upserted before eras, which resolve both server-side, by external id,
    // against whatever these two prior steps just wrote.
    const leagueOutcome = await app.get(TpLeaguesImportService).importLeague();
    const rulesSetsOutcome = await app
      .get(TpRulesSetsImportService)
      .importRulesSets();
    const eraOutcome = await app.get(TpErasImportService).importEras();

    const competitionOutcome = await app
      .get(TpCompetitionsImportService)
      .importCompetitions();

    // Every competition's DB id is resolved once here, server-side by
    // external id (its TP id, stringified), rather than threaded through as
    // a client-side id map: one batched lookup for the whole run, reused
    // below both for match category classification and for the hired-star
    // era resolution. A resolve miss is recorded as an ImportError by the
    // service itself (see TpCompetitionIdResolverService), not silently
    // dropped.
    const {
      result: competitionIdResolutionResult,
      competitionTypesByCompetitionId,
      eraIdByCompetitionId,
    } = await app.get(TpCompetitionIdResolverService).resolveCompetitionIds({
      competitionsByTpId: competitionOutcome.competitionsByTpId,
    });

    // Matches link to their competition only via the directory scan competitions
    // import already performed (match files carry no tournament id), so this
    // consumes competitionOutcome.matchesByCompetitionId rather than re-scanning.
    // Each competition's type (for match category classification) comes from
    // the same competitions import's upsert payloads, keyed by DB competition
    // id via competitionTypesByCompetitionId, resolved just above by
    // TpCompetitionIdResolverService.

    const { result: matchResult, matchIdsByTpId } = await app
      .get(TpMatchesImportService)
      .importMatches({
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        competitionTypesByCompetitionId,
      });

    const coachOutcome = await app.get(TpCoachesImportService).importCoaches();

    // Roster files (rosters_<id>.json) are scanned and parsed once here, then
    // shared by races/teams/positions below, so a bad file is reported once
    // instead of independently by each of the three imports.
    const rosterErrors: ImportError[] = [];
    const rosters = await app
      .get(RosterCollectionService)
      .collect(rosterErrors);
    const rosterCollectionResult = app.get(ImportResultService).result({
      imported: 0,
      errors: rosterErrors,
    });

    const raceOutcome = await app
      .get(TpRacesImportService)
      .importRaces(rosters);

    const teamOutcome = await app
      .get(TpTeamsImportService)
      .importTeams(rosters);

    const {
      result: positionResult,
      starPositionIds,
      characteristicsByPositionId,
    } = await app.get(TpPositionsImportService).importPositions(rosters, {
      raceNamesById: raceOutcome.raceNamesById,
    });

    // Characteristics run immediately after the positions step that produced
    // them: the map is keyed by the position ids that step just upserted, and
    // by the rules set ids its era config resolved. This runs in the same TP
    // importer invocation that writes position availability, which is a
    // separate (and later) invocation than the BBL importer's -- so TP's
    // per-rules-set values overwrite BBL's converted snapshot for every
    // position the two sources share, which is the intent of issue #669.
    // Star players need no special casing: position_rules_sets is keyed by
    // positionId alone.
    const positionCharacteristicsOutcome = await app
      .get(TpPositionCharacteristicsImportService)
      .syncPositionCharacteristics(characteristicsByPositionId);

    // A roster id can appear under more than one era (TpTeamsImportService's
    // era-union grouping), so resolving a hired star player's team era later
    // needs the real eraId the inducements_roll event came from -- not a
    // guess. eraIdByCompetitionId (each DB competition id's real eraId) was
    // already resolved above by TpCompetitionIdResolverService, the same
    // value TpTeamParticipationImportService already resolves roster ids
    // against.

    // Star players hired via an inducements_roll event aren't part of any
    // roster's lineUps[], so they're gathered from the already-parsed match
    // events (already-parsed data reused here, not re-scanned) and grouped
    // by the hiring roster id AND the real era the match's
    // competition belongs to (so a roster id spanning multiple eras
    // resolves its team era unambiguously downstream, instead of guessing).
    // Hired-star extraction is skipped when a competition's eraId can't be
    // resolved (match-embedded player accumulation above still runs) --
    // shouldn't happen in practice.
    //
    // This same pass also builds matchEmbeddedPlayersByRosterId: a standalone
    // rosters_<id>.json file only reflects a roster's CURRENT composition as
    // of when the local TP data mirror was downloaded, so a player who has
    // since left/been replaced is silently absent from it even though
    // historical matchEvents[] can still reference them. Each match's own
    // homeRosterPlayers/awayRosterPlayers (parsed from
    // inscriptionLocal/Visitor.roster.lineUps[]) embeds a per-match snapshot
    // of that side's roster, so accumulating them across every match a
    // roster played (deduped by player id) fills that gap without a third
    // scan of matchesByCompetitionId.
    const inducedStarPlayerHireGroupsByKey = new Map<
      string,
      { rosterId: number; eraId: number; starPlayers: TpInducedStarPlayer[] }
    >();
    const matchEmbeddedPlayersByRosterIdMut = new Map<
      number,
      Map<number, TpRosterPlayer>
    >();
    const accumulateMatchEmbeddedPlayers = (
      rosterId: number,
      players: TpRosterPlayer[],
    ) => {
      let byPlayerId = matchEmbeddedPlayersByRosterIdMut.get(rosterId);
      if (!byPlayerId) {
        byPlayerId = new Map<number, TpRosterPlayer>();
        matchEmbeddedPlayersByRosterIdMut.set(rosterId, byPlayerId);
      }
      for (const player of players) {
        byPlayerId.set(player.id, player);
      }
    };
    for (const [
      competitionId,
      matches,
    ] of competitionOutcome.matchesByCompetitionId.entries()) {
      const eraId = eraIdByCompetitionId.get(competitionId);
      for (const match of matches) {
        accumulateMatchEmbeddedPlayers(
          match.homeTeamTpId,
          match.homeRosterPlayers,
        );
        accumulateMatchEmbeddedPlayers(
          match.awayTeamTpId,
          match.awayRosterPlayers,
        );

        if (eraId === undefined) {
          continue;
        }
        for (const event of match.matchEvents) {
          if (
            event.type !== 'inducements_roll' ||
            event.starPlayers.length === 0
          ) {
            continue;
          }
          const key = `${event.rosterId}:${eraId}`;
          const existingGroup = inducedStarPlayerHireGroupsByKey.get(key);
          if (existingGroup) {
            existingGroup.starPlayers.push(...event.starPlayers);
          } else {
            inducedStarPlayerHireGroupsByKey.set(key, {
              rosterId: event.rosterId,
              eraId,
              starPlayers: [...event.starPlayers],
            });
          }
        }
      }
    }
    const inducedStarPlayerHireGroups = Array.from(
      inducedStarPlayerHireGroupsByKey.values(),
    );
    const matchEmbeddedPlayersByRosterId = new Map(
      Array.from(matchEmbeddedPlayersByRosterIdMut.entries()).map(
        ([rosterId, byPlayerId]) => [rosterId, Array.from(byPlayerId.values())],
      ),
    );

    // Players run after positions and teams: each roster player resolves a
    // team era (via teamOutcome.teamErasByRosterId) and a position (server-
    // side, by external id, against whatever the positions step above just
    // upserted), so both must exist first. Roster player
    // data is unioned with matchEmbeddedPlayersByRosterId (built above) so a
    // player who has since left/been replaced on a roster -- absent from the
    // standalone roster file -- is still imported and resolvable.
    // playerIdsByLineUpId and starPlayerIdsByRosterAndMaster are kept in
    // scope for the match-events step below.
    // characteristicsByPositionId (from the positions step above) is consumed
    // only by the induced-star-hire path: a star hired mid-season has no
    // lineUps[] entry of their own, so their characteristics come from the
    // star position's template. Ordinary roster players carry their own.
    const {
      result: playerResult,
      playerIdsByLineUpId,
      starPlayerIdsByRosterAndMaster,
      starPositionUsages,
      careerSppCountsByPlayerId,
    } = await app.get(TpPlayersImportService).importPlayers({
      rosters,
      teamErasByRosterId: teamOutcome.teamErasByRosterId,
      inducedStarPlayerHireGroups,
      matchEmbeddedPlayersByRosterId,
      starPositionIds,
      characteristicsByPositionId,
    });

    // Star positions get zero positions_race_eras rows from the regular
    // position sync (they're grouped by name, not race), so this post-players
    // step derives their (race, era) availability from actual usage -- the
    // starPositionUsages the players step just emitted. Regular positions are
    // already handled by TpPositionsImportService. Runs after players because
    // star usage (which team/race+era fielded each star) is only known once
    // players are imported. Idempotent (syncRaceEras is upsert-only).
    const positionRaceErasOutcome = await app
      .get(TpPositionRaceErasImportService)
      .syncStarPositionRaceEras({
        starPositionUsages,
      });

    // Team participation (match_teams + competition_teams) runs before match
    // events: match events resolve team-era ids the same way (roster id +
    // era), and — more importantly — the server upsert match events uses
    // resolves against match_teams, which this step is what populates.
    const teamParticipationOutcome = await app
      .get(TpTeamParticipationImportService)
      .importTeamParticipation({
        competitionsByTpId: competitionOutcome.competitionsByTpId,
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
        rosters,
      });

    // Trophy awards run after competitions, teams and team participation:
    // each award resolves its own competition (server-side, by external id,
    // from competitionsByTpId), that competition's curated group
    // (competitionsByTpId's competitionGroupId, read off the competition
    // upsert's own response) and its winning team's team era
    // (teamErasByRosterId + the competition's own eraId). TP records
    // team awards only -- placements plus Best Stunty / Wooden Spoon -- so no
    // player data is needed here.
    const trophyAwardsOutcome = await app
      .get(TpTrophyAwardsImportService)
      .importTrophyAwards({
        competitionsByTpId: competitionOutcome.competitionsByTpId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
      });

    // Match events (touchdowns and injuries/casualties) run last: they need
    // match_teams (populated above), the players step's lineUpId/star-player
    // maps, and reuse the same matchesByCompetitionId + eraIdByCompetitionId
    // already built for the hired-star-player scan above (competition DB id
    // -> its real eraId), rather than resolving the era a second time.
    const matchEventsOutcome = await app
      .get(TpMatchEventsImportService)
      .importMatchEvents({
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        eraIdByCompetitionId,
        matchIdsByTpId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
        playerIdsByLineUpId,
        starPlayerIdsByRosterAndMaster,
      });

    // Runs after the match-events step: the adjustment is the gap between
    // TP's own reported career total (already stored on players.spp_total by
    // the players step) and what the player's events explain -- the spp_value
    // those events just wrote, PLUS an estimate of the SPP earned in
    // competitions still in progress that have not been imported, priced from
    // the career action counts the players step collected. Star players hired
    // via an inducements_roll carry no reported total, so the server skips
    // them and their adjustment stays NULL.
    const sppAdjustmentsOutcome = await app
      .get(TpSppAdjustmentsImportService)
      .importSppAdjustments({
        playerIds: [
          ...playerIdsByLineUpId.values(),
          ...starPlayerIdsByRosterAndMaster.values(),
        ],
        careerCountsByPlayerId: careerSppCountsByPlayerId,
      });

    // Match outcomes run last: scores are counted from the touchdown events
    // imported just above, and TP's own `winner` field per match is used
    // directly as a tie-break -- no bracket reconstruction needed, since TP
    // already exposes this signal per match, independent of score.
    const matchOutcomesOutcome = await app
      .get(TpMatchOutcomesImportService)
      .importMatchOutcomes({
        matchesByCompetitionId: competitionOutcome.matchesByCompetitionId,
        matchIdsByTpId,
        eraIdByCompetitionId,
        teamErasByRosterId: teamOutcome.teamErasByRosterId,
      });

    // One-off developer review aid: whatever SPP the ongoing-competition
    // estimate could NOT explain, so a real discrepancy can be told apart from
    // the estimate's grouping approximations. Not persisted anywhere.
    for (const line of app
      .get(TpSppAdjustmentsImportService)
      .summaryLines(sppAdjustmentsOutcome.nonzeroAdjustments)) {
      console.log(line);
    }

    const results = [
      leagueOutcome.result,
      rulesSetsOutcome.result,
      eraOutcome.result,
      competitionOutcome.result,
      competitionIdResolutionResult,
      matchResult,
      coachOutcome.result,
      rosterCollectionResult,
      raceOutcome.result,
      teamOutcome.result,
      positionResult,
      positionCharacteristicsOutcome.result,
      playerResult,
      positionRaceErasOutcome.result,
      teamParticipationOutcome.result,
      trophyAwardsOutcome.result,
      matchEventsOutcome.result,
      sppAdjustmentsOutcome.result,
      matchOutcomesOutcome.result,
    ];
    return {
      success: results.every((r) => r.success),
      imported: results.reduce((sum, r) => sum + r.imported, 0),
      errors: results.flatMap((r) => r.errors),
    };
  } finally {
    await app.close();
  }
}

run()
  .then((result) => {
    if (result.success) {
      console.log(`Imported ${result.imported} record(s) successfully.`);
    } else {
      console.error(`Import completed with ${result.errors.length} errors:`);
      result.errors.forEach((e) => console.error(`  - ${e.message}`));
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error('Import failed:', error);
    process.exit(1);
  });

import type {
  RulesSet,
  SppCareerCounts,
} from '@blood-bowl-tracker/api-contract';
import { SPP_CAREER_COUNT_KEYS } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  PlayerCharacteristicIncreasesService,
  PlayersImportService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type {
  TpCareerSppCounts,
  TpPlayerSkills,
  TpPositionCharacteristics,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { TpEraRulesSetResolverService } from '../eras/tp-era-rules-set-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';
import type { InducedStarPlayerHireGroup } from './tp-induced-star-players-import.service';
import { TpInducedStarPlayersImportService } from './tp-induced-star-players-import.service';
import { TpLastingInjuryBuilderService } from './tp-lasting-injury-builder.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';

/** One mercenary Big Guy hire's position usage: the mercenary Position's DB
 * id and the raw race/era references it was hired into (resolved downstream
 * by `TpMercenaryPositionRaceErasImportService` into `positions_race_eras`
 * rows). Unlike regular and star positions -- which TP's official team list
 * now describes directly -- a mercenary hire appears on no official-list
 * catalog at all, so its race/era availability still has to be derived from
 * observed hires. */
export interface MercenaryPositionUsage {
  positionId: number;
  teamRaceCode: string;
  era: string;
}

/** Options for {@link TpPlayersImportService.importPlayers}, bundled into one
 * object to stay within the repo's 3-parameter limit. */
export interface ImportPlayersOptions {
  rosters: RosterEntry[];
  teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  /**
   * Star players hired via an `inducements_roll` match event, grouped by
   * hiring roster id AND real era id (pre-scanned by `main.ts` from
   * `matchesByCompetitionId` so this service stays the single owner of the
   * player-resolution maps). Optional -- callers/tests that don't exercise
   * star players can omit it.
   */
  inducedStarPlayerHireGroups?: InducedStarPlayerHireGroup[];
  /**
   * Players seen in match-embedded roster snapshots
   * (`TpMatch.homeRosterPlayers`/`awayRosterPlayers`), grouped by roster id
   * (pre-scanned by `main.ts` from `matchesByCompetitionId`, so this service
   * stays the single owner of the player-resolution maps). A standalone
   * `rosters_<id>.json` file only reflects a roster's CURRENT composition as
   * of when the local TP data mirror was downloaded, so a player who has
   * since left/been replaced is silently absent from it even though
   * historical `matchEvents[]` can still reference them — this map fills
   * that gap. Optional -- callers/tests that don't exercise this path can
   * omit it, matching the existing `inducedStarPlayerHireGroups?` pattern.
   */
  matchEmbeddedPlayersByRosterId?: Map<number, TpRosterPlayer[]>;
  /**
   * Each Position's accumulated characteristics, keyed by DB position id then
   * rules set DB id, from `TpPositionsImportService`. Used only by the
   * induced-star-hire path: a star hired mid-season via an `inducements_roll`
   * event has no `lineUps[]` entry, so no characteristics of their own -- a
   * freshly-hired star's are the position template's. Optional -- callers and
   * tests that don't exercise star hires can omit it.
   */
  characteristicsByPositionId?: Map<
    number,
    Map<number, TpPositionCharacteristics>
  >;
  /**
   * Every rules set the run upserted, keyed by name, from the rules-sets
   * step. Needed to read a stat reduction out of a current-vs-template gap:
   * which direction is "worse" is per characteristic per rules set. Optional
   * so callers that do not need lasting injuries (tests, future callers) can
   * omit it — a player then simply gets no reduction counts.
   */
  rulesSetsByName?: Map<string, RulesSet>;
}

@Injectable()
export class TpPlayersImportService {
  constructor(
    private readonly playersImport: PlayersImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly positionsImport: PositionsImportService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly rosterCollection: RosterCollectionService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
    private readonly eraRulesSetResolver: TpEraRulesSetResolverService,
    private readonly characteristicsBuilder: TpPlayerCharacteristicsBuilderService,
    private readonly mercenaryCharacteristics: TpMercenaryCharacteristicsService,
    private readonly lastingInjuryBuilder: TpLastingInjuryBuilderService,
    private readonly inducedStarPlayers: TpInducedStarPlayersImportService,
    private readonly characteristicIncreases: PlayerCharacteristicIncreasesService,
  ) {}

  /**
   * Players carry only their TP `lineUpId` as an external id, never a `Name`
   * one: player names are not unique.
   *
   * Each roster's player list is unioned with the per-match snapshots in
   * `matchEmbeddedPlayersByRosterId`, because a standalone roster file reflects
   * only the roster's composition as of the data mirror — a player who has
   * since left is absent from it while match events still reference them. The
   * standalone file wins for any id it does list, being the freshest.
   *
   * A player whose `lineUpMasterId` is in neither catalog falls back to
   * `fallbackPositionName` only when flagged `isBigGuy` (a mercenary hire has
   * no catalog entry at all); the gate keeps the fallback from masking a
   * genuine regular-position catalog gap.
   *
   * `starPlayerIdsByRosterAndMaster` is keyed by roster and `lineUpMasterId`
   * because match events reference a star by master id within a roster, never
   * by a `lineUps[].id`. `careerSppCountsByPlayerId` feeds the SPP-adjustment
   * step, which discounts SPP earned in competitions not yet imported.
   */
  async importPlayers({
    rosters,
    teamErasByRosterId,
    inducedStarPlayerHireGroups,
    matchEmbeddedPlayersByRosterId,
    characteristicsByPositionId,
    rulesSetsByName,
  }: ImportPlayersOptions): Promise<{
    result: ImportResult;
    playerIdsByLineUpId: Map<number, number>;
    starPlayerIdsByRosterAndMaster: Map<string, number>;
    careerSppCountsByPlayerId: Map<number, SppCareerCounts>;
    mercenaryPositionUsages: MercenaryPositionUsage[];
    insertedPlayerIds: number[];
    skillsByPlayerId: Map<number, TpPlayerSkills>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const playerIdsByLineUpId = new Map<number, number>();
    const starPlayerIdsByRosterAndMaster = new Map<string, number>();
    const careerSppCountsByPlayerId = new Map<number, SppCareerCounts>();
    const mercenaryPositionUsages: MercenaryPositionUsage[] = [];
    // The DB ids of players this run INSERTED. Only these need the
    // post-matchEvents lasting-injury history backfill: an existing player
    // already carries whatever history earlier runs built for them.
    const insertedPlayerIds: number[] = [];
    // Every roster player's own skills, keyed by their DATABASE id. A player
    // with no group at all -- a match-embedded-only, departed player -- is
    // simply absent: see TpPlayerSkills for why that data cannot be recorded.
    const skillsByPlayerId = new Map<number, TpPlayerSkills>();

    // Star Player Points is a career total that only ever increases. The
    // same player (lineUp) id can legitimately recur across multiple
    // roster/match-embedded sources -- each a snapshot in time -- with
    // different totalStarPlayerPoints values, so the correct sppTotal is the
    // MAXIMUM seen across every occurrence, not whichever source happens to
    // be processed last. Pre-scan every source before the main upsert loop
    // below (which still uses each roster entry's own data for everything
    // else) so the loop can look up the max instead of the entry's own,
    // possibly-stale, value.
    const maxSppTotalByPlayerId = new Map<number, number>();
    const noteSppTotal = (playerId: number, total: number): void => {
      const existing = maxSppTotalByPlayerId.get(playerId);
      if (existing === undefined || total > existing) {
        maxSppTotalByPlayerId.set(playerId, total);
      }
    };
    for (const { roster } of rosters) {
      for (const player of roster.players) {
        noteSppTotal(player.id, player.totalStarPlayerPoints);
      }
    }
    if (matchEmbeddedPlayersByRosterId) {
      for (const players of matchEmbeddedPlayersByRosterId.values()) {
        for (const player of players) {
          noteSppTotal(player.id, player.totalStarPlayerPoints);
        }
      }
    }

    // TP's per-action-type career counters have the same "career total, only
    // ever increases" property as totalStarPlayerPoints, and the same lineUp
    // id can recur across sources, so keep the per-group MAXIMUM for the same
    // reason maxSppTotalByPlayerId does. Only the standalone roster file
    // carries these counters at all -- match-embedded snapshots do not -- so a
    // player seen only there contributes none and, downstream, gets no
    // ongoing-competition estimate.
    const maxCareerCountsByLineUpId = new Map<number, SppCareerCounts>();
    const noteCareerCounts = (
      lineUpId: number,
      counts: TpCareerSppCounts | undefined,
    ): void => {
      if (counts === undefined) {
        return;
      }
      const mapped: SppCareerCounts = {
        touchdown: counts.touchdowns,
        completion: counts.completions,
        // TP reports one combined interception counter (its raw data has no
        // deflection field) and one combined casualty counter (no severity
        // breakdown); both are priced with a single representative award value
        // server-side.
        interception: counts.interceptions,
        mvp_award: counts.mvpAwards,
        casualty: counts.casualties,
      };
      const existing = maxCareerCountsByLineUpId.get(lineUpId);
      if (existing === undefined) {
        maxCareerCountsByLineUpId.set(lineUpId, mapped);
        return;
      }
      for (const group of SPP_CAREER_COUNT_KEYS) {
        existing[group] = Math.max(existing[group], mapped[group]);
      }
    };
    for (const { roster } of rosters) {
      for (const player of roster.players) {
        noteCareerCounts(player.id, player.careerCounts);
      }
    }
    if (matchEmbeddedPlayersByRosterId) {
      for (const players of matchEmbeddedPlayersByRosterId.values()) {
        for (const player of players) {
          noteCareerCounts(player.id, player.careerCounts);
        }
      }
    }

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        playerIdsByLineUpId,
        starPlayerIdsByRosterAndMaster,
        careerSppCountsByPlayerId,
        mercenaryPositionUsages,
        insertedPlayerIds,
        skillsByPlayerId,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let eras: EraDataConfig[];
    try {
      eras = this.eraDataConfig.getEras();
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        playerIdsByLineUpId,
        starPlayerIdsByRosterAndMaster,
        careerSppCountsByPlayerId,
        mercenaryPositionUsages,
        insertedPlayerIds,
        skillsByPlayerId,
      };
    }
    const eraNames = [...new Set(eras.map((era) => era.name))];
    const eraIds = await this.lookup.lookupMap(
      'era',
      eraNames.map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
    );
    // Reverse lookup for the induced-star path (which knows numeric eraId /
    // only a rosterId), so every emitted usage carries raw string references.
    const eraNameByEraId = new Map<number, string>(
      eraNames
        .map(
          (name) =>
            [
              eraIds.get(
                this.lookup.keyOf({
                  externalSystemId: tpSystemId,
                  externalId: name,
                }),
              ),
              name,
            ] as const,
        )
        .filter((entry): entry is [number, string] => entry[0] !== undefined),
    );
    // Characteristics are per rules set, and a player's era declares which one
    // validates them. Resolved once for the whole run by the same shared
    // service the positions importer uses; an era it skipped (zero or several
    // declared rules sets, or an unresolvable name) simply gets no
    // characteristics -- it has already recorded its own error, and the rest
    // of that era's player import is unaffected.
    const rulesSetIdByEraName =
      await this.eraRulesSetResolver.resolveRulesSetIdByEraName({
        eras,
        tpSystemId,
        errors,
      });
    // The curated mercenary table is keyed by rules-set NAME while the
    // resolver above yields ids, so the fallback below needs both.
    const rulesSetNameByEraName =
      this.mercenaryCharacteristics.rulesSetNameByEraName(eras);
    const mercenaryPositionIdsByName = new Map<string, number>();

    // One batched lookup for the whole run, not one per player: collect
    // every distinct lineUpMasterId across the merged roster players (the
    // standalone roster file's own players plus any match-embedded ones) up
    // front, then resolve them all in a single lookupMap call.
    const lineUpMasterIds = new Set<number>();
    for (const { roster } of rosters) {
      for (const player of roster.players) {
        lineUpMasterIds.add(player.lineUpMasterId);
      }
    }
    if (matchEmbeddedPlayersByRosterId) {
      for (const players of matchEmbeddedPlayersByRosterId.values()) {
        for (const player of players) {
          lineUpMasterIds.add(player.lineUpMasterId);
        }
      }
    }
    const positionIds = await this.lookup.lookupMap(
      'position',
      [...lineUpMasterIds].map((lineUpMasterId) => ({
        externalSystemId: tpSystemId,
        externalId: String(lineUpMasterId),
      })),
    );

    for (const { roster, era } of rosters) {
      const eraId = eraIds.get(
        this.lookup.keyOf({ externalSystemId: tpSystemId, externalId: era }),
      );
      if (eraId === undefined) {
        errors.push(this.rosterCollection.unknownEraError(era, roster));
      }

      // Merge the match-embedded roster snapshot into the standalone
      // roster's players, keyed by player id: start from the
      // match-embedded entries (a departed player, absent from
      // roster.players, may only exist here), then overlay roster.players
      // so the standalone file's data wins for any id it lists.
      const mergedPlayers = new Map<number, (typeof roster.players)[number]>(
        (matchEmbeddedPlayersByRosterId?.get(roster.id) ?? []).map((player) => [
          player.id,
          player,
        ]),
      );
      for (const player of roster.players) {
        mergedPlayers.set(player.id, player);
      }

      for (const player of mergedPlayers.values()) {
        const teamEras = teamErasByRosterId.get(roster.id);
        const teamEra = teamEras?.find((te) => te.eraId === eraId);
        if (teamEra === undefined) {
          errors.push(
            this.importResults.error({
              item: { player: player.id, rosterId: roster.id, era },
              message: `Skipped player "${player.name}" (${player.id}): could not resolve team era for roster ${roster.id} in era "${era}"`,
            }),
          );
          continue;
        }

        let positionId = positionIds.get(
          this.lookup.keyOf({
            externalSystemId: tpSystemId,
            externalId: String(player.lineUpMasterId),
          }),
        );
        let fromMercenary = false;
        if (positionId === undefined && player.isBigGuy) {
          positionId = await this.resolveMercenaryPositionId({
            player,
            tpSystemId,
            nameSystemId,
            mercenaryPositionIdsByName,
            errors,
          });
          fromMercenary = positionId !== undefined;
        }
        if (positionId === undefined) {
          errors.push(
            this.importResults.error({
              item: {
                player: player.id,
                lineUpMasterId: player.lineUpMasterId,
              },
              message: `Skipped player "${player.name}" (${player.id}): could not resolve position for lineUpMasterId ${player.lineUpMasterId}`,
            }),
          );
          continue;
        }

        // TP embeds every player's OWN current characteristics in lineUps[],
        // star and mercenary hires included, so no path is special-cased here.
        // A player merged in from a match-embedded snapshot carries none and
        // sends none, leaving any previously-imported values untouched.
        // Unlike sppTotal above, this is not deduplicated across a player id
        // recurring in more than one era's roster: whichever entry this loop
        // processes last wins. Fine when the values genuinely agree (the
        // normal case for one physical player), but if a player id were ever
        // reused across two eras with different rules sets, one upsert would
        // validate against the wrong rules set's declared characteristics.
        // A mercenary Big Guy hire is the one exception: TP embeds nothing for
        // it, so it falls back to curated data below.
        let characteristics = this.characteristicsBuilder.forRosterPlayer({
          characteristics: player.characteristics,
          eraName: era,
          rulesSetIdByEraName,
        });
        // A mercenary Big Guy hire carries no ma/st/ag/pa/av anywhere in TP's
        // data, so fall back to the curated table. Checked only after the
        // player's own values, so a future TP payload that does embed real
        // ones still wins.
        if (characteristics === undefined && fromMercenary) {
          const rulesSetName = rulesSetNameByEraName.get(era);
          const rulesSetId = rulesSetIdByEraName.get(era);
          characteristics = this.mercenaryCharacteristics.forRosterPlayer({
            positionName: player.fallbackPositionName,
            player: { id: player.id, name: player.name },
            rulesSet:
              rulesSetName !== undefined && rulesSetId !== undefined
                ? { name: rulesSetName, id: rulesSetId }
                : undefined,
            errors,
          });
        }

        // The rules set's declared formats, reached through the same
        // era -> rules-set-name map the mercenary path already uses, so no
        // second era resolution is introduced. Undefined when the era
        // resolved to no single rules set, or the rules-sets step did not
        // return one: the builder then still sends the two kinds TP reports
        // directly and no reduction counts.
        const rulesSet = rulesSetsByName?.get(
          rulesSetNameByEraName.get(era) ?? '',
        );
        const lastingInjuries = this.lastingInjuryBuilder.forRosterPlayer({
          player,
          rulesSet,
        });
        // The increase counts need the same three things the reduction counts
        // do -- the player's own values, the rules set that says which
        // direction is better, and the position they hold -- plus a baseline
        // to measure against. A player with no characteristics at all (a
        // match-embedded-only entry) or no resolved rules set sends no
        // increase group: the group is all-or-nothing, and inventing zeroes
        // from an absence would be worse than saying nothing.
        //
        // `player.positionTemplate` -- the same embedded baseline
        // `lastingInjuryBuilder` above already uses for the reduction counts
        // -- is passed through as the increase baseline too, so the two
        // counts are measured against the same reference rather than letting
        // the shared service fall back to a separate DB read that could
        // disagree with it. It is only absent for a mercenary/star hire (no
        // embedded `lineUpMaster`), for which the shared service falls back to
        // its own DB-read baseline exactly as before. TP always reports a
        // literal 0 for a missing Passing characteristic rather than omitting
        // it, so that field is converted to `null` when the rules set itself
        // declares no Passing characteristic -- the shape the DB-read baseline
        // uses and the increase computation's own comparison-skip logic
        // expects.
        const baseline =
          player.positionTemplate === undefined
            ? undefined
            : {
                ...player.positionTemplate,
                passing:
                  rulesSet?.passingFormat === 'absent'
                    ? null
                    : player.positionTemplate.passing,
              };
        // `rulesSet === undefined` records no error of its own here: an era
        // resolving to no single rules set, or an unresolvable rules-set
        // name, is already reported upstream by
        // `TpEraRulesSetResolverService.resolveRulesSetIdByEraName` (see its
        // doc comment), so a second error at this omission site would be
        // redundant, not an oversight.
        const increaseCounts =
          characteristics === undefined || rulesSet === undefined
            ? undefined
            : await this.characteristicIncreases.forPlayer({
                player: {
                  label: `player "${player.name}" (${player.id})`,
                  positionId,
                },
                rulesSet,
                current: {
                  move: characteristics.move,
                  strength: characteristics.strength,
                  agility: characteristics.agility,
                  passing: characteristics.passing,
                  armour: characteristics.armour,
                },
                reductions: lastingInjuries,
                errors,
                baseline,
              });

        const upserted = await this.playersImport.upsertPlayerResult(
          {
            name: player.name,
            teamEraId: teamEra.id,
            positionId,
            // TP reports the player's career SPP total directly, but the
            // same player id can recur across roster/match-embedded sources
            // with a different total each time (see maxSppTotalByPlayerId's
            // doc comment above) -- use the precomputed maximum, not this
            // entry's own value. The induced-star-player path below has no
            // such field and passes none, leaving players.spp_total NULL for
            // those.
            sppTotal:
              maxSppTotalByPlayerId.get(player.id) ??
              player.totalStarPlayerPoints,
            ...characteristics,
            ...lastingInjuries,
            ...increaseCounts,
            externalIds: [
              { externalSystemId: tpSystemId, externalId: String(player.id) },
            ],
          },
          errors,
        );
        if (upserted) {
          imported += 1;
          playerIdsByLineUpId.set(player.id, upserted.id);
          if (upserted.created) {
            insertedPlayerIds.push(upserted.id);
          }
          // Same last-roster-wins convention as `characteristics` above when a
          // player id recurs across more than one roster: whichever entry
          // this loop processes last is what gets sent for sync. The sync
          // itself is upsert-only and never deletes, so on a warm database an
          // earlier roster's skills survive regardless; only a fresh import
          // risks losing a skill listed solely on an earlier roster.
          if (player.skills !== undefined) {
            skillsByPlayerId.set(upserted.id, player.skills);
          }
          const careerCounts = maxCareerCountsByLineUpId.get(player.id);
          if (careerCounts !== undefined) {
            careerSppCountsByPlayerId.set(upserted.id, careerCounts);
          }
          // A mercenary Big Guy's position appears on no TP official-list
          // catalog at all, so -- unlike regular and star positions -- its
          // race/era availability still has to be derived from actual usage.
          // See MercenaryPositionUsage's doc comment.
          if (fromMercenary) {
            mercenaryPositionUsages.push({
              positionId,
              teamRaceCode: roster.teamRaceCode,
              era,
            });
          }
        }
      }
    }

    if (inducedStarPlayerHireGroups) {
      const hires = await this.inducedStarPlayers.importHires({
        groups: inducedStarPlayerHireGroups,
        teamErasByRosterId,
        context: {
          tpSystemId,
          nameSystemId,
          eraNameByEraId,
          rulesSetIdByEraName,
          characteristicsByPositionId,
        },
        errors,
      });
      imported += hires.imported;
      for (const [key, id] of hires.starPlayerIdsByRosterAndMaster) {
        starPlayerIdsByRosterAndMaster.set(key, id);
      }
      insertedPlayerIds.push(...hires.insertedPlayerIds);
    }

    return {
      result: this.importResults.result({ imported, errors }),
      playerIdsByLineUpId,
      starPlayerIdsByRosterAndMaster,
      careerSppCountsByPlayerId,
      mercenaryPositionUsages,
      insertedPlayerIds,
      skillsByPlayerId,
    };
  }

  /**
   * Resolve (reusing across calls via `mercenaryPositionIdsByName`) the
   * `isStarPlayer: true` Position for a mercenary Big Guy player's inline
   * `fallbackPositionName` -- see {@link importPlayers}'s doc comment for
   * why this fallback exists and why it's gated on `isBigGuy`. Returns
   * undefined (recording an `ImportError`) if the upsert itself fails.
   * Also reads the position's curated `position_rules_sets` rows, once per
   * distinct mercenary name.
   */
  private async resolveMercenaryPositionId(options: {
    player: TpRosterPlayer;
    tpSystemId: number;
    nameSystemId: number;
    mercenaryPositionIdsByName: Map<string, number>;
    errors: ImportError[];
  }): Promise<number | undefined> {
    const {
      player,
      tpSystemId,
      nameSystemId,
      mercenaryPositionIdsByName,
      errors,
    } = options;
    const cached = mercenaryPositionIdsByName.get(player.fallbackPositionName);
    if (cached !== undefined) {
      return cached;
    }

    const position = await this.positionsImport.upsert(
      {
        name: player.fallbackPositionName,
        isStarPlayer: true,
        externalIds: [
          {
            externalSystemId: tpSystemId,
            externalId: player.fallbackPositionName,
          },
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forStarPosition(
              player.fallbackPositionName,
            ),
          },
        ],
      },
      errors,
    );
    if (!position) {
      return undefined;
    }
    mercenaryPositionIdsByName.set(player.fallbackPositionName, position.id);
    // TP has no characteristics for a mercenary position anywhere, so its
    // values come from the curated position_rules_sets row tools/import-manual
    // wrote before this importer ran; read it once here. Placed after the
    // cache write, so the early `cached` return above makes this run once per
    // distinct mercenary name per import run, not once per hire.
    await this.mercenaryCharacteristics.loadPositionCharacteristics({
      positionName: player.fallbackPositionName,
      positionId: position.id,
      errors,
    });
    return position.id;
  }
}

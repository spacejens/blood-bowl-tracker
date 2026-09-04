import type { RulesSet, UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PlayersImportService,
  ReferenceLookupService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { CharacteristicNotationConversionService } from '../shared/characteristic-notation-conversion.service';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { PlayerPageParser } from './player-page-parser';

const PLAYER_PAGE_TYPE = 'pl';

interface ImportPlayersOptions {
  teamsByCode: Map<string, UpsertTeam>;
  racesByBblId: Map<string, { id: number; name: string }>;
  /**
   * Every upserted rules set, keyed by name — for its declared
   * `passingFormat`, which decides whether a player's scraped Passing value
   * applies to their era at all.
   */
  rulesSetsByName: Map<string, RulesSet>;
}

@Injectable()
export class BblPlayersImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly playerPageParser: PlayerPageParser,
    private readonly playersImport: PlayersImportService,
    private readonly teamsImport: TeamsImportService,
    private readonly eraConfig: EraConfigService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
    private readonly upsertFieldNarrowing: UpsertFieldNarrowingService,
    private readonly notationConversion: CharacteristicNotationConversionService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import every player found on the BBL `p=pl` pages. Each player is resolved
   * to a team era (via its team code + the era whose player-id range contains
   * its pid, or an explicit `playerIdOverrides` entry when the pid is a known
   * boundary exception) and a position (via the composite typId-raceBblId
   * key), then upserted keyed by its pid under the BBL external system only —
   * unlike other entities, players get no Name external id, since player
   * names are not guaranteed unique across the league. Players that cannot be
   * fully resolved are recorded as errors and skipped. Idempotent. Each
   * player's scraped MA/ST/AG/PA/AV line is sent alongside, validated
   * server-side against the last rules set listed for their era — a rules set
   * that declares no Passing characteristic receives a null Passing rather
   * than the value BBL's BB2020 migration wrote onto most players, and a
   * rules set that writes Agility/Armour as bare numbers receives those two
   * converted out of BBL's BB2020 notation.
   */
  async importPlayers({
    teamsByCode,
    racesByBblId,
    rulesSetsByName,
  }: ImportPlayersOptions): Promise<{
    result: ImportResult;
    playerIdsByPid: Map<string, number>;
    /**
     * The team era each imported player belongs to, keyed by pid. A player
     * never changes teams, so this is also the team era a trophy award for
     * that player is recorded under (see
     * `packages/db/src/schema/trophy-awards.ts`).
     */
    teamEraIdsByPid: Map<string, number>;
    positionsUsedByEra: Set<string>;
    scrapedSppTotalsByPlayerId: Map<number, number | null>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const playerIdsByPid = new Map<string, number>();
    const teamEraIdsByPid = new Map<string, number>();
    const positionsUsedByEra = new Set<string>();
    // BBL's own displayed career total per imported player, keyed by DB id.
    // Only an input to the spp_adjustment computation — never stored as
    // players.spp_total, since BBL's figure mixes award rates across eras.
    const scrapedSppTotalsByPlayerId = new Map<number, number | null>();

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [{ name: bblSystemName, category: 'imported_data_source' }],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        playerIdsByPid,
        teamEraIdsByPid,
        positionsUsedByEra,
        scrapedSppTotalsByPlayerId,
      };
    }
    const [bblSystemId] = bootstrap.ids;

    const eras = this.eraConfig.getEras();

    // One round trip for the whole run: every era referenced here was
    // upserted moments ago by the eras step, so it is already in the
    // database and resolvable by the same external id (its name) that step
    // wrote. Resolved once into a name-keyed map so the per-player loop below
    // can keep looking eras up by name.
    const eraNames = [...new Set(eras.map((era) => era.identity.name))];
    const eraRefs = eraNames.map((name) => ({
      externalSystemId: bblSystemId,
      externalId: name,
    }));
    const resolvedEraIds = await this.lookup.lookupMap('era', eraRefs);
    const eraIdsByName = new Map<string, number>();
    for (const name of eraNames) {
      const id = resolvedEraIds.get(
        this.lookup.keyOf({ externalSystemId: bblSystemId, externalId: name }),
      );
      if (id !== undefined) {
        eraIdsByName.set(name, id);
      }
    }

    const raceBblIdByDbId = new Map<number, string>();
    for (const [bblId, info] of racesByBblId) {
      raceBblIdByDbId.set(info.id, bblId);
    }

    // One round trip for the whole run: every position referenced here was
    // upserted moments ago by the positions step, so it is already in the
    // database and resolvable by its composite typId-raceBblId external id.
    // A first pass over the player pages (this service cannot know which
    // positions it needs until it has seen every player's typId and team)
    // collects the distinct refs; the per-player loop below then resolves
    // each player's position from the one batched result.
    const positionRefs = new Set<string>();
    for await (const page of this.sourceReader.pages(PLAYER_PAGE_TYPE)) {
      try {
        const player = this.playerPageParser.extractPlayer(page);
        if (!player) {
          continue;
        }
        const team = teamsByCode.get(player.teamCode);
        if (!team) {
          continue;
        }
        const raceBblId = raceBblIdByDbId.get(
          this.upsertFieldNarrowing.resolveDefiniteRaceId(team),
        );
        if (raceBblId === undefined) {
          continue;
        }
        positionRefs.add(`${player.typId}-${raceBblId}`);
      } catch {
        // A bad team (e.g. no resolvable race id) is skipped here; the main
        // loop below re-processes this page inside its own try/catch and
        // records the actual error for it.
        continue;
      }
    }
    const positionIds = await this.lookup.lookupMap(
      'position',
      [...positionRefs].map((externalId) => ({
        externalSystemId: bblSystemId,
        externalId,
      })),
    );

    const eraByOverriddenPid = new Map<number, (typeof eras)[number]>();
    for (const era of eras) {
      for (const pid of era.players.playerIdOverrides ?? []) {
        eraByOverriddenPid.set(pid, era);
      }
    }
    const eraByOverriddenTeamCode = new Map<string, (typeof eras)[number]>();
    for (const era of eras) {
      for (const teamCode of era.teams?.teamCodeOverrides ?? []) {
        eraByOverriddenTeamCode.set(teamCode, era);
      }
    }

    for await (const page of this.sourceReader.pages(PLAYER_PAGE_TYPE)) {
      try {
        const player = this.playerPageParser.extractPlayer(page);
        if (!player) {
          errors.push(
            this.importResults.error({
              item: { pid: page.params.pid },
              message: `Failed to parse player page for pid "${page.params.pid}": missing pid, <h1>, position link, team link, or characteristics line.`,
            }),
          );
          continue;
        }

        const pidNumber = Number(player.pid);
        const era =
          eraByOverriddenTeamCode.get(player.teamCode) ??
          eraByOverriddenPid.get(pidNumber) ??
          eras.find(
            (e) =>
              e.players.autoAssignByPlayerId &&
              e.players.firstPlayerId !== undefined &&
              pidNumber >= e.players.firstPlayerId &&
              (e.players.lastPlayerId === undefined ||
                pidNumber <= e.players.lastPlayerId),
          );
        if (!era) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, name: player.name },
              message: `Skipped player "${player.name}" (${player.pid}): no era range contains this player id`,
            }),
          );
          continue;
        }

        const eraId = eraIdsByName.get(era.identity.name);
        if (eraId === undefined) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, era: era.identity.name },
              message: `Skipped player "${player.name}" (${player.pid}): era "${era.identity.name}" not imported`,
            }),
          );
          continue;
        }

        // An era can span several rules sets, listed chronologically
        // oldest-first; the last one is the era's most current, and is what a
        // BB2020-era scrape of the player's characteristics is measured
        // against. Validation-only — nothing stores a rules set on a player.
        // `rulesSets` is schema-enforced to be non-empty, so `.at(-1)` is
        // undefined only for era config this import never actually loads
        // (e.g. a hand-built test fixture); the `?? '?'` fallback below
        // exists for that case only.
        const rulesSetName = era.identity.rulesSets.at(-1);
        const rulesSet =
          rulesSetName === undefined
            ? undefined
            : rulesSetsByName.get(rulesSetName);
        if (!rulesSet) {
          errors.push(
            this.importResults.error({
              item: {
                pid: player.pid,
                era: era.identity.name,
                rulesSet: rulesSetName,
              },
              message: `Skipped player "${player.name}" (${player.pid}): rules set "${rulesSetName ?? '?'}" for era "${era.identity.name}" not imported`,
            }),
          );
          continue;
        }

        const team = teamsByCode.get(player.teamCode);
        if (!team) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, teamCode: player.teamCode },
              message: `Skipped player "${player.name}" (${player.pid}): team "${player.teamCode}" not imported`,
            }),
          );
          continue;
        }

        const upsertedTeam = await this.teamsImport.upsert(
          { ...team, eras: [eraId] },
          errors,
        );
        if (!upsertedTeam) {
          continue;
        }
        const teamEra = upsertedTeam.eras.find((e) => e.eraId === eraId);
        if (!teamEra) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, team: team.name, eraId },
              message: `Skipped player "${player.name}" (${player.pid}): could not resolve team era`,
            }),
          );
          continue;
        }

        const raceBblId = raceBblIdByDbId.get(
          this.upsertFieldNarrowing.resolveDefiniteRaceId(team),
        );
        const positionId =
          raceBblId !== undefined
            ? positionIds.get(
                this.lookup.keyOf({
                  externalSystemId: bblSystemId,
                  externalId: `${player.typId}-${raceBblId}`,
                }),
              )
            : undefined;
        if (positionId === undefined) {
          errors.push(
            this.importResults.error({
              item: {
                pid: player.pid,
                typId: player.typId,
                raceBblId,
              },
              message: `Skipped player "${player.name}" (${player.pid}): no position for ${player.typId}-${raceBblId ?? '?'}`,
            }),
          );
          continue;
        }

        const upserted = await this.playersImport.upsertPlayerResult(
          {
            name: player.name,
            teamEraId: teamEra.id,
            positionId,
            move: player.characteristics.move,
            strength: player.characteristics.strength,
            // BBL only ever shows BB2020 notation, so a player whose era
            // predates it needs their Agility/Armour rewritten into the
            // notation their own rules set declares.
            agility: this.notationConversion.convertAgility(
              player.characteristics.agility,
              rulesSet.agilityFormat,
            ),
            // Two distinct states: a rules set with no Passing concept at all
            // stores null, while a rules set that has Passing stores 0 for a
            // player who cannot pass (the page's "-"). BBL's BB2020 migration
            // wrote a Passing value onto most players, so the page's own
            // figure is never what decides this — the era's rules set is.
            passing:
              rulesSet.passingFormat === 'absent'
                ? null
                : (player.characteristics.passing ?? 0),
            armour: this.notationConversion.convertArmour(
              player.characteristics.armour,
              rulesSet.armourFormat,
            ),
            rulesSetId: rulesSet.id,
            externalIds: [
              { externalSystemId: bblSystemId, externalId: player.pid },
            ],
          },
          errors,
        );
        if (upserted) {
          imported += 1;
          playerIdsByPid.set(player.pid, upserted.id);
          teamEraIdsByPid.set(player.pid, teamEra.id);
          positionsUsedByEra.add(`${positionId}:${eraId}`);
          scrapedSppTotalsByPlayerId.set(upserted.id, player.sppTotal);
        }
      } catch (error) {
        errors.push(this.pageParseError.build(page.params, 'player', error));
        continue;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      playerIdsByPid,
      teamEraIdsByPid,
      positionsUsedByEra,
      scrapedSppTotalsByPlayerId,
    };
  }
}

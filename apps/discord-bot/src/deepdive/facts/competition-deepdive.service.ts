import type { CompetitionTrophyAward } from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
  DEEPDIVE_COMPETITION_NO_TROPHIES_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TROPHIES_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TROPHY_CONTEXT_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { PlayerContextService } from '../../insights/player-context.service';
import { TeamContextService } from '../../insights/team-context.service';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';
import {
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type CompetitionHeader = {
  id: number;
  name: string;
  type: 'season' | 'cup';
  eraId: number;
  eraName: string;
  competitionGroupId: number;
  competitionGroupName: string;
  startDate: string;
  endDate: string | null;
};
type ParticipatingTeam = { id: number; name: string };

/**
 * An award recipient's decorated race/coach (team) or
 * position/team/race/coach (player) suffix, keyed by the id `formatAward`
 * looks it up with. Mirrors `RecipientContext` in `trophy-deepdive.service.ts`.
 */
type AwardContext = {
  teamSuffixes: Map<number, string>;
  playerSuffixes: Map<number, string>;
};

/**
 * Composes the competition header (type), its era line, its recurring group,
 * its duration, its participating-teams list, and its trophies/awards section
 * into a single embed. Shared by `/deepdive competition:<id>` and the
 * competition deepdive buttons. Each
 * DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so a
 * timeout is distinguishable from a genuine "not found" (`undefined`). The
 * era (always present) and each participating team are rendered as drill-down
 * buttons in one combined pool, teams first so they take component priority
 * over the era header entry; the recurring group gets its own drill-up
 * button, labelled with the group's own name (not the competition's).
 * A `Trophies & awards:` section follows the participating-teams list,
 * naming every trophy this competition handed out and who received it, in the
 * query's team-awards-then-player-awards order. Recipients are decorated with
 * the same race/coach (team) or position/team/race/coach (player) context the
 * trophy deepdive shows, so a reader can identify a winner they do not know
 * by name. Each recipient and each distinct trophy becomes a drill-down
 * entry; a team that both participated and won is collapsed to one button by
 * `buildEntityComponents`' own dedup, so this service adds no team/player
 * dedup of its own (trophy entries are still locally deduped by id — see
 * `buildTrophyEntries`).
 */
@Injectable()
export class CompetitionDeepdiveService {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly trophyAwards: TrophyAwardsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly teamContext: TeamContextService,
    private readonly playerContext: PlayerContextService,
    private readonly dateRangeFormatter: DateRangeFormatterService,
  ) {}

  async resolve(
    competitionId: number,
  ): Promise<string | InteractionReplyOptions> {
    const competition: CompetitionHeader | undefined | null =
      await this.databaseTimeout.run(
        this.competitions.findByIdWithEra(competitionId),
        null,
      );
    if (competition === null) {
      return DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE;
    }
    if (competition === undefined) {
      return DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE;
    }

    const teams: ParticipatingTeam[] | null = await this.databaseTimeout.run(
      this.competitions.listTeams(competitionId),
      null,
    );
    if (teams === null) {
      return DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE;
    }

    // A competition is not scoped to one race or coach, so both add
    // information here. Wrapped in the same timeout handling as every other
    // DB call in this method, since attachSuffixes does its own DB round trip.
    const decorated: (ParticipatingTeam & { contextSuffix: string })[] | null =
      await this.databaseTimeout.run(
        this.teamContext.attachSuffixes(teams, (row) => row.id, {
          includeRace: true,
          includeCoach: true,
        }),
        null,
      );
    if (decorated === null) {
      return DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE;
    }

    const awards: CompetitionTrophyAward[] | null =
      await this.databaseTimeout.run(
        this.trophyAwards.listForCompetition(competitionId),
        null,
      );
    if (awards === null) {
      return DEEPDIVE_COMPETITION_TROPHIES_TIMEOUT_MESSAGE;
    }

    // No awards means nothing to decorate, so skip the context lookup
    // entirely — otherwise an unnecessary timeout here could turn a known
    // "nothing was handed out" answer into a spurious timeout message. Same
    // reasoning as `TrophyDeepdiveService` skipping it for a zero-recipient
    // trophy.
    let awardContext: AwardContext = {
      teamSuffixes: new Map(),
      playerSuffixes: new Map(),
    };
    if (awards.length > 0) {
      const resolvedContext: AwardContext | null =
        await this.databaseTimeout.run(this.buildAwardContext(awards), null);
      if (resolvedContext === null) {
        return DEEPDIVE_COMPETITION_TROPHY_CONTEXT_TIMEOUT_MESSAGE;
      }
      awardContext = resolvedContext;
    }

    const teamLines =
      decorated.length > 0
        ? decorated.map((team) => `${team.name}${team.contextSuffix}`)
        : [DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE];

    const awardLines =
      awards.length > 0
        ? [
            'Trophies & awards:',
            ...awards.map((award) => this.formatAward(award, awardContext)),
          ]
        : [DEEPDIVE_COMPETITION_NO_TROPHIES_MESSAGE];

    const descriptionLines = [
      `Type: ${competition.type}`,
      `Era: ${competition.eraName}`,
      `Group: ${competition.competitionGroupName}`,
      `Duration: ${this.dateRangeFormatter.format(competition.startDate, competition.endDate)}`,
      '',
      'Participating teams:',
      ...teamLines,
      '',
      ...awardLines,
    ];

    // Team-list entries first: buildEntityComponents has no internal
    // prioritisation (first-N / first-group wins), so the participating-teams
    // list gets drill-down controls before the era header entry does, and the
    // drill-up to the recurring competition group comes last of all. Award
    // recipients and distinct trophies come after the team entries and
    // before the era entry.
    const entries: EntityComponentEntry[] = [
      ...teams.map((team): EntityComponentEntry => ({
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(team.id),
        label: team.name,
      })),
      ...awards.map((award) => this.buildAwardEntry(award)),
      ...this.buildTrophyEntries(awards),
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(competition.eraId),
        label: competition.eraName,
      },
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(competition.competitionGroupId),
        label: competition.competitionGroupName,
      },
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);
    const description = [
      ...descriptionLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(COMPETITION_BUTTON_CUSTOM_ID_PREFIX)} ${competition.name}`,
          description,
        },
      ],
      components,
    };
  }

  /**
   * Batches the race/coach lookup for every team-kind award and the
   * position/team/race/coach lookup for every player-kind award into a suffix
   * map each, so `formatAward` is a plain lookup. Run as one `Promise.all`
   * under a single `databaseTimeout.run` because the two are halves of the
   * same decoration step — telling the reader which half was slow would not
   * help them. Mirrors `TrophyDeepdiveService.buildRecipientContext`.
   */
  private async buildAwardContext(
    awards: CompetitionTrophyAward[],
  ): Promise<AwardContext> {
    const teamRows = awards.filter((row) => this.isTeamAward(row));
    const playerRows = awards.filter((row) => !this.isTeamAward(row));
    const [decoratedTeams, decoratedPlayers] = await Promise.all([
      this.teamContext.attachSuffixes(teamRows, (row) => row.teamId, {
        includeRace: true,
        includeCoach: true,
      }),
      this.playerContext.attachSuffixes(
        playerRows,
        (row) => row.playerId as number,
        {
          includePosition: true,
          includeTeam: true,
          includeRace: true,
          includeEra: false,
          includeCoach: true,
        },
      ),
    ]);
    return {
      teamSuffixes: new Map(
        decoratedTeams.map((row) => [row.teamId, row.contextSuffix]),
      ),
      playerSuffixes: new Map(
        decoratedPlayers.map((row) => [
          row.playerId as number,
          row.contextSuffix,
        ]),
      ),
    };
  }

  /**
   * A team award names the team with its race/coach context; a player award
   * names the player with their position/team/race/coach context. The
   * `playerId`/`playerName` casts are safe on the player branch: `isTeamAward`
   * guarantees both are set there, regardless of what `recipientKind` claims.
   * Mirrors `TrophyDeepdiveService.formatRecipient`.
   */
  private formatAward(
    award: CompetitionTrophyAward,
    context: AwardContext,
  ): string {
    return this.isTeamAward(award)
      ? `${award.trophyName}: ${award.teamName}${context.teamSuffixes.get(award.teamId) ?? ''}`
      : `${award.trophyName}: ${award.playerName}${context.playerSuffixes.get(award.playerId as number) ?? ''}`;
  }

  /** Drill down to whoever actually received the award. */
  private buildAwardEntry(award: CompetitionTrophyAward): EntityComponentEntry {
    return this.isTeamAward(award)
      ? {
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(award.teamId),
          label: award.teamName,
        }
      : {
          customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(award.playerId),
          label: award.playerName as string,
        };
  }

  /**
   * A plain boolean (rather than a type guard) so it can gate both the
   * filters in `buildAwardContext` and the ternaries above with one shared
   * predicate. Checks `playerId` and `playerName` rather than trusting
   * `recipientKind` alone: `trophy_awards` carries no database constraint
   * preventing a `player`-kind row from having a null `playerId` or
   * `playerName` (see `packages/db/src/schema/trophy-awards.ts`), so a row
   * like that is treated as a team award — using `teamName`/`teamId`, which
   * are never null — rather than rendering a `null` label or a broken
   * button. Mirrors `TrophyDeepdiveService.isTeamRecipient`.
   */
  private isTeamAward(award: CompetitionTrophyAward): boolean {
    return (
      award.recipientKind === 'team' ||
      award.playerId === null ||
      award.playerName === null
    );
  }

  /**
   * One drill-across entry per *distinct* trophy. Several awards can share a
   * trophy — a tie, or one trophy covering several podium places — so the
   * rows are deduped by trophy id here rather than leaning on
   * `buildEntityComponents`' own dedup, keeping the entry pool honest about
   * how many distinct controls it is asking for.
   */
  private buildTrophyEntries(
    awards: CompetitionTrophyAward[],
  ): EntityComponentEntry[] {
    const byTrophyId = new Map<number, string>();
    for (const award of awards) {
      if (!byTrophyId.has(award.trophyId)) {
        byTrophyId.set(award.trophyId, award.trophyName);
      }
    }
    return [...byTrophyId].map(([trophyId, trophyName]) => ({
      customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      entityId: String(trophyId),
      label: trophyName,
    }));
  }
}

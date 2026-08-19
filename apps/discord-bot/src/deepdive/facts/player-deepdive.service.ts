import type {
  PlayerDeepdiveCategoryCounts,
  PlayerDeepdiveEventGroup,
  PlayerHonor,
  PlayerKillEntry,
  PlayerKillerInfo,
  StarPlayerIdentity,
} from '@blood-bowl-tracker/game-data';
import {
  PlayerDeathService,
  PlayersService,
  StarPlayersService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  MAX_DESCRIPTION_LENGTH,
  OVERFLOW_NOTE_BUDGET,
} from '../../description-limits';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_DEATH_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_STAR_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PlayerRowButtonService } from '../player-row-button.service';
import { PlayerKillsSectionService } from './player-kills-section.service';

type Player = {
  id: number;
  name: string;
  teamName: string;
  teamId: number;
  raceName: string;
  raceId: number;
  positionName: string;
  eraName: string;
  eraId: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
};
/**
 * Most honors listed in one player embed. Deliberately its own constant rather
 * than a shared import of `MAX_TEAM_HONORS`: the two facts start at the same
 * value but are free to drift apart. The list query fetches exactly this many
 * rows; the true total comes from `countByPlayer`, so the overflow note
 * reports an exact remainder.
 */
const MAX_PLAYER_HONORS = 30;

/**
 * Most kills listed in one player embed. Its own constant rather than a shared
 * `MAX_PLAYER_HONORS`: the two start at the same value but are free to drift
 * apart. The list query fetches exactly this many rows; the true total comes
 * from `countKillsInflicted`, so the overflow note reports an exact remainder.
 */
const MAX_PLAYER_KILLS = 30;

/**
 * Composes the player header (team, era, race, position) and per-category event
 * counts into a single embed. Shared by `/deepdive player:<id>` and the player
 * deepdive buttons. Each DB call is wrapped in `databaseTimeout.run` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`). Only non-zero categories are listed; an all-zero player shows
 * a short placeholder instead of an empty list. Team, era and race each get a
 * drill-down button, in the same order as the header lines; position has no
 * deepdive target, so it gets none.
 * When the player suffered a `death` consequence, a trailing `Status:` header
 * line names whoever was responsible — a specific player, a single team, an
 * "or"-joined list of candidate teams from a multi-team match, or a
 * mysterious-circumstances fallback — and the killer player or team(s) each
 * get a drill-down button, placed after the honors buttons and before the
 * team/era/race header buttons. A player who did not die gets no Status line
 * and no extra buttons.
 * When the player has a computed `sppTotal`, a trailing section shows any
 * manual adjustment and the total.
 * Between the header and the category counts sits an Honors section listing
 * the trophies this player has personally won, newest competition first,
 * capped at `MAX_PLAYER_HONORS` with an exact "…and N more not shown."
 * remainder. Unlike the team deepdive's equivalent it needs neither era
 * grouping nor a per-row team name — a player belongs to exactly one team-era
 * for their whole career, so the header already names both. The section is
 * omitted entirely when the player has won nothing. Each honor adds a
 * drill-down button to its trophy, ahead of the header buttons. Because
 * competition and trophy names carry no length ceiling tight enough to
 * guarantee `MAX_PLAYER_HONORS` rows always fit Discord's own embed
 * description limit, the honors actually rendered may be a further-trimmed
 * prefix of the fetched rows — see `buildHonorLines`. `enforceDescriptionLimit`
 * is a final, independent safety net on the fully-assembled string, so the
 * limit holds even if that budgeting ever falls out of sync with the rest of
 * the description's actual size.
 * After the SPP totals sits a `Kills:` section listing the matches this
 * player killed an opponent in, newest match first, capped at
 * `MAX_PLAYER_KILLS` with an exact "…and N more not shown." note — built by
 * the injected `PlayerKillsSectionService` (extracted purely for this file's
 * size). It is omitted entirely when the player has killed nobody.
 * Because the kills section sits below the honors budget's other content, it
 * is built first and its own lines are folded into `buildHonorLines`'s
 * `otherLines`, so a long kill list is what gets trimmed against, not the
 * other way around — this holds regardless of the kills section's own print
 * position in the final description. Each listed victim adds a drill-down
 * button, placed after the killer entries (if any) and before the
 * team/era/race header buttons.
 * When the player is a hire of a star player, one further drill-down button
 * — labelled with the star's name — opens the star-player deepdive showing
 * every team that has hired them; a regular player gets none.
 */
@Injectable()
export class PlayerDeepdiveService {
  constructor(
    private readonly players: PlayersService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly trophyAwards: TrophyAwardsService,
    private readonly playerDeath: PlayerDeathService,
    private readonly playerKills: PlayerKillsSectionService,
    private readonly stars: StarPlayersService,
    private readonly playerRowButton: PlayerRowButtonService,
  ) {}

  async resolve(playerId: number): Promise<string | InteractionReplyOptions> {
    const player: Player | undefined | null = await this.databaseTimeout.run(
      this.players.findById(playerId),
      null,
    );
    if (player === null) {
      return DEEPDIVE_PLAYER_TIMEOUT_MESSAGE;
    }
    if (player === undefined) {
      return DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE;
    }

    // Both honors queries share one timeout message: they are two halves of
    // the same "what has this player won?" answer, and telling the reader
    // which of them was slow would not help them.
    const honorsTotal: number | null = await this.databaseTimeout.run(
      this.trophyAwards.countByPlayer(playerId),
      null,
    );
    if (honorsTotal === null) {
      return DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE;
    }

    // A player confirmed to have won nothing has nothing left to list, so skip
    // the list query rather than let an unnecessary timeout there turn a known
    // "no honors" answer into a spurious timeout message.
    let honors: PlayerHonor[] = [];
    if (honorsTotal > 0) {
      const rows: PlayerHonor[] | null = await this.databaseTimeout.run(
        this.trophyAwards.listByPlayer(playerId, MAX_PLAYER_HONORS),
        null,
      );
      if (rows === null) {
        return DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE;
      }
      honors = rows;
    }

    const counts: PlayerDeepdiveCategoryCounts | null =
      await this.databaseTimeout.run(
        this.players.getDeepdiveCategoryCounts(playerId),
        null,
      );
    if (counts === null) {
      return DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE;
    }

    // `null` is `getKillerInfo`'s real "this player is still alive" answer, so
    // the timeout sentinel has to be `undefined` rather than the `null` the
    // other queries here use.
    const killer: PlayerKillerInfo | null | undefined =
      await this.databaseTimeout.run(
        this.playerDeath.getKillerInfo(playerId),
        undefined,
      );
    if (killer === undefined) {
      return DEEPDIVE_PLAYER_DEATH_TIMEOUT_MESSAGE;
    }

    // Both kills queries share one timeout message, the same way the two
    // honors queries do. The sentinel is `undefined` rather than `null`
    // because an empty list is a real answer here, same reasoning as `killer`.
    const killsTotal: number | undefined = await this.databaseTimeout.run(
      this.playerDeath.countKillsInflicted(playerId),
      undefined,
    );
    if (killsTotal === undefined) {
      return DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE;
    }

    // A player confirmed to have killed nobody has nothing left to list, so
    // skip the list query rather than let an unnecessary timeout there turn a
    // known "no kills" answer into a spurious timeout message.
    let kills: PlayerKillEntry[] = [];
    if (killsTotal > 0) {
      const rows: PlayerKillEntry[] | undefined =
        await this.databaseTimeout.run(
          this.playerDeath.getKillsInflicted(playerId, MAX_PLAYER_KILLS),
          undefined,
        );
      if (rows === undefined) {
        return DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE;
      }
      kills = rows;
    }

    // `undefined` is the real "this is a regular player" answer, so the
    // timeout sentinel is `null` — the opposite way round from the killer and
    // kills queries above, whose real answers can themselves be null.
    const star: StarPlayerIdentity | undefined | null =
      await this.databaseTimeout.run(this.stars.findByPlayerId(playerId), null);
    if (star === null) {
      return DEEPDIVE_PLAYER_STAR_TIMEOUT_MESSAGE;
    }

    const header = [
      `Team: ${player.teamName}`,
      `Era: ${player.eraName}`,
      `Race: ${player.raceName}`,
      `Position: ${player.positionName}`,
      ...(killer === null ? [] : [this.buildStatusLine(killer)]),
    ];

    const categoryLines = this.buildCategoryLines(counts);

    // No placeholder when the player has no trophies — the section is simply
    // absent, rather than reported empty. This also covers the case where the
    // list query raced a deletion and came back empty against a stale nonzero
    // total: there is no section for an overflow note to attach to either way.
    // Unlike the team deepdive there is no era grouping and no team on the
    // row: a player belongs to exactly one team-era for their whole career,
    // so the embed's own `Team:`/`Era:` header already names both.
    //
    // Competition and trophy names are user-imported data with no length
    // ceiling tight enough to guarantee `MAX_PLAYER_HONORS` rows always fit
    // Discord's embed description limit, so the honors actually shown are
    // further trimmed to fit within that limit — see `buildHonorLines`.
    // The kills section is budgeted first and its lines then counted as part
    // of the honors budget: honors sit above the counters, kills below them,
    // and only one of the two can be trimmed against a stale view of the
    // other. Trimming honors — the older, less specific content — is the
    // better trade.
    const countLines = [...categoryLines, ...this.buildTotalLines(player)];
    const killsSection = this.playerKills.build({
      kills,
      killsTotal,
      otherLines: [...header, '', ...countLines],
    });
    const otherLines = [...header, '', ...countLines, ...killsSection.lines];
    const { shown: shownHonors, lines: honorLines } = this.buildHonorLines(
      honors,
      honorsTotal,
      otherLines,
    );

    // Honors entries first, then the header entries: buildEntityComponents has
    // no internal prioritisation (first-N / first-group wins), and the honors
    // are the most specific content on the embed. Only the trophy is offered
    // per honor: the player is the embed's own subject, and the team already
    // has a header entry. Only honors that made it into the text get a
    // button, so a text-length-truncated honor never offers a drill-down
    // button with nothing to explain what it links to.
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        ...shownHonors.map((honor): EntityComponentEntry => ({
          customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(honor.trophyId),
          label: honor.trophyName,
        })),
        ...this.buildKillerEntries(killer),
        ...killsSection.entries,
        {
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.teamId),
          label: player.teamName,
        },
        {
          customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.eraId),
          label: player.eraName,
        },
        {
          customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.raceId),
          label: player.raceName,
        },
        // A star's identity is its position, so this one hire's embed can only
        // ever show one team. The star-player deepdive shows every team that
        // has hired them — always-available context about the subject, like
        // the team/era/race entries it sits with, so it goes in the same
        // header-derived group rather than ahead of the honors/kills entries.
        // Labelled with the star's name, matching every other drill-down
        // button in this codebase (entity name, never an action phrase).
        ...(star === undefined
          ? []
          : [
              {
                customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
                entityId: String(star.positionId),
                label: star.name,
              } satisfies EntityComponentEntry,
            ]),
      ]);

    const description = [
      ...header,
      ...(honorLines.length === 0 ? [] : ['', 'Trophies:', ...honorLines]),
      '',
      ...categoryLines,
      ...this.buildTotalLines(player),
      ...killsSection.lines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(PLAYER_BUTTON_CUSTOM_ID_PREFIX)} ${player.name}`,
          description: this.enforceDescriptionLimit(description),
        },
      ],
      components,
    };
  }

  /**
   * The counter block: the five simple categories in their fixed order (zero
   * ones omitted), then the casualty and foul lines, each carrying its own
   * severity breakdown. A player with nothing at all in any counter gets a
   * short placeholder rather than an empty block.
   */
  private buildCategoryLines(counts: PlayerDeepdiveCategoryCounts): string[] {
    const lines = [
      ...counts.simple
        .filter((category) => category.count > 0)
        .map((category) => `${category.label}: ${category.count}`),
      ...this.buildGroupLine('Casualties inflicted', counts.casualties),
      ...this.buildGroupLine('Fouls committed', counts.fouls),
    ];
    return lines.length === 0 ? [DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE] : lines;
  }

  /**
   * One counter line with a severity breakdown, e.g.
   * `Fouls committed: 7 (3 serious injuries, 2 killed)`. A zero sub-count is
   * dropped from the parenthetical along with its comma, the parenthetical
   * disappears when both are zero, and a zero total drops the line entirely —
   * matching this embed's "no placeholder for zero" convention throughout.
   */
  private buildGroupLine(
    label: string,
    group: PlayerDeepdiveEventGroup,
  ): string[] {
    if (group.total === 0) {
      return [];
    }
    const parts = [
      ...(group.seriousInjuries === 0
        ? []
        : [`${group.seriousInjuries} serious injuries`]),
      ...(group.killed === 0 ? [] : [`${group.killed} killed`]),
    ];
    const breakdown = parts.length === 0 ? '' : ` (${parts.join(', ')})`;
    return [`${label}: ${group.total}${breakdown}`];
  }

  /**
   * Absolute safety net for Discord's embed description limit. The budget
   * `buildHonorLines` reserves keeps every currently-reachable input
   * comfortably under `MAX_DESCRIPTION_LENGTH`, but that accounting assumes
   * the rest of the description (header, category counts, totals) stays
   * within a realistic size — an assumption this method does not rely on.
   * It measures the actual assembled string and truncates as a last resort
   * if it somehow still overflows, so a future change to any other section
   * can never cause Discord to reject the whole response.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }

  /**
   * Selects a prefix of `honors` that keeps the whole description within
   * Discord's `MAX_DESCRIPTION_LENGTH`, and renders it into lines (plus an
   * exact overflow note when anything — whether beyond `MAX_PLAYER_HONORS`
   * or beyond what fits by length — was left out). `otherLines` is every
   * other part of the description (header, category counts, totals); its
   * length is reserved before greedily adding honor rows one at a time,
   * stopping as soon as the next row would no longer fit within the budget
   * reserved for `OVERFLOW_NOTE_BUDGET`. Honors are already ordered
   * newest-first, so trimming from the end drops the oldest shown honors,
   * not the most recent ones.
   */
  private buildHonorLines(
    honors: PlayerHonor[],
    honorsTotal: number,
    otherLines: string[],
  ): { shown: PlayerHonor[]; lines: string[] } {
    if (honors.length === 0) {
      return { shown: [], lines: [] };
    }

    const heading = ['', 'Trophies:'];
    let budget =
      MAX_DESCRIPTION_LENGTH -
      otherLines.join('\n').length -
      heading.join('\n').length -
      1 - // the newline joining "Trophies:" to the first honor row
      // Also reserved separately inside `PlayerKillsSectionService.build`
      // for its own overflow note. When both sections render on the same
      // embed this budget is reserved twice — deliberately: it's a safe,
      // conservative overlap, not a bug to collapse into one shared
      // reservation.
      OVERFLOW_NOTE_BUDGET;

    const shown: PlayerHonor[] = [];
    for (const honor of honors) {
      const cost = this.formatHonor(honor).length + 1;
      if (cost > budget) {
        break;
      }
      budget -= cost;
      shown.push(honor);
    }

    const lines = shown.map((honor) => this.formatHonor(honor));
    // `honorsTotal` is the real number of honors, so this remainder is exact
    // rather than "at least one more" — it accounts for both rows never
    // fetched (beyond `MAX_PLAYER_HONORS`) and fetched rows dropped here for
    // length. Not gated on `shown.length > 0`: even a single honor whose own
    // line is too long to fit still leaves the player with `honorsTotal`
    // honors, and the note is the only way that stays visible rather than
    // reading identically to "has won nothing".
    const truncatedCount = honorsTotal - shown.length;
    if (truncatedCount > 0) {
      lines.push(`…and ${truncatedCount} more not shown.`);
    }
    return { shown, lines };
  }

  /** One honor's description line: `<competition> (<trophy>)`. */
  private formatHonor(honor: PlayerHonor): string {
    return `${honor.competitionName} (${honor.trophyName})`;
  }

  /**
   * The trailing total section: nothing at all when no total has been computed
   * (null), otherwise a blank separator line, an optional adjustment line, and
   * the total. A computed total of 0 is shown — unlike a zero category count,
   * it is a real value rather than an absence. `sppTotal` already includes
   * `sppAdjustment`, so the adjustment line calls that out explicitly rather
   * than leaving a reader to assume the two lines should be summed.
   * `sppAdjustment` is clamped non-negative wherever it's written today
   * (`SppAdjustmentsService`), so the negative-sign branch below is
   * defensive against a future or manually-edited negative value.
   */
  private buildTotalLines(player: Player): string[] {
    if (player.sppTotal === null) {
      return [];
    }
    const adjustment = player.sppAdjustment;
    const adjustmentLines =
      adjustment === null || adjustment === 0
        ? []
        : [
            `Star player points adjustment: ${
              adjustment > 0 ? `+${adjustment}` : String(adjustment)
            } (included)`,
          ];
    return [
      '',
      ...adjustmentLines,
      `Total star player points: ${player.sppTotal}`,
    ];
  }

  /**
   * The `Status:` line for a player who died, at whatever precision the data
   * supports, with a trailing note when the fatal blow was a foul. Only
   * rendered when the player actually died — there is no always-present
   * placeholder line for living players.
   */
  private buildStatusLine(killer: PlayerKillerInfo): string {
    const note = killer.viaFoul ? ' (via a foul)' : '';
    return `Status: ${this.formatKiller(killer)}${note}`;
  }

  /** The killer clause of the `Status:` line, without the foul note. */
  private formatKiller(killer: PlayerKillerInfo): string {
    switch (killer.kind) {
      case 'player':
        return `Killed by ${killer.playerName} (${killer.positionName}, ${killer.teamName}, ${killer.raceName}, ${killer.coachName})`;
      case 'team':
        return `Killed by ${this.playerKills.formatTeam(killer)}`;
      case 'ambiguousTeams':
        return `Killed by ${this.playerKills.joinWithOr(
          killer.teams.map((team) => this.playerKills.formatTeam(team)),
        )}`;
      case 'unknown':
        return 'Killed in mysterious circumstances';
    }
  }

  /**
   * Drill-down entries for the killer: the killer player, the killer team, or
   * one entry per candidate team when the killer is ambiguous. Only the killer
   * entity itself is offered — never its position, race or coach — matching how
   * the player toplist insights button only the player.
   */
  private buildKillerEntries(
    killer: PlayerKillerInfo | null,
  ): EntityComponentEntry[] {
    if (killer === null) {
      return [];
    }
    switch (killer.kind) {
      case 'player':
        return [
          this.playerRowButton.buildPlayerRowButton({
            playerId: killer.playerId,
            playerName: killer.playerName,
            positionId: killer.positionId,
            positionName: killer.positionName,
            isStarPlayer: killer.isStarPlayer,
          }),
        ];
      case 'team':
        return [
          {
            customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
            entityId: String(killer.teamId),
            label: killer.teamName,
          },
        ];
      case 'ambiguousTeams':
        return killer.teams.map((team) => ({
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(team.teamId),
          label: team.teamName,
        }));
      case 'unknown':
        return [];
    }
  }
}

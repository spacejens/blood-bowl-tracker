import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import type {
  PlayerDeepdiveCategoryCounts,
  PlayerHonor,
  PlayerKillEntry,
  PlayerKillerInfo,
  PositionCharacteristicsContext,
  StarPlayerIdentity,
} from '@blood-bowl-tracker/game-data';
import {
  CharacteristicDisplayFormattingService,
  PlayerDeathService,
  PlayersService,
  PositionRulesSetsService,
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
  DEEPDIVE_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_DEATH_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_STAR_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { EventCountLinesService } from '../../shared/event-count-lines.service';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PlayerKillerInfoFormatterService } from './player-killer-info-formatter.service';
import { PlayerKillsSectionService } from './player-kills-section.service';

type Player = {
  id: number;
  name: string;
  teamName: string;
  teamId: number;
  raceName: string;
  raceId: number;
  positionName: string;
  positionId: number;
  eraName: string;
  eraId: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
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
 * How a characteristic that has moved away from the position's baseline is
 * marked. Comparison is on the raw stored numbers, before formatting, so a
 * not-yet-curated 0 still reads as a decrease next to its dash.
 */
const INCREASED = '▲'; // the raw value is higher than the baseline
const DECREASED = '▼'; // the raw value is lower than the baseline

/**
 * Composes the player deepdive embed, shared by `/deepdive player:<id>` and
 * the player deepdive buttons.
 *
 * Each DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so a
 * timeout stays distinguishable from a genuine "not found" (`undefined`).
 *
 * The kills section is built before honors and folded into
 * `buildHonorLines`'s `otherLines`, so honors — not kills — is what shrinks
 * when the kill list is long: kills is trimmed against its own fixed budget
 * first, then honors gets whatever space remains, regardless of where either
 * section prints in the final embed. `enforceDescriptionLimit` is an
 * independent final net on the assembled string, so Discord's limit holds
 * even if that budgeting falls out of sync.
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
    private readonly killerInfo: PlayerKillerInfoFormatterService,
    private readonly eventCountLines: EventCountLinesService,
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly characteristics: CharacteristicDisplayFormattingService,
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

    // Last of the supplementary queries, deliberately: the timeout tests for
    // every earlier query count `run` invocations, and appending here leaves
    // their ordering untouched. `undefined` is this query's own real "no rules
    // set applies to this era" answer, so the timeout sentinel is `null`.
    const characteristicsContext:
      PositionCharacteristicsContext | undefined | null =
      await this.databaseTimeout.run(
        this.positionRulesSets.findCharacteristicsContext(
          player.positionId,
          player.eraId,
        ),
        null,
      );
    if (characteristicsContext === null) {
      return DEEPDIVE_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE;
    }

    const header = [
      `Team: ${player.teamName}`,
      `Era: ${player.eraName}`,
      `Race: ${player.raceName}`,
      `Position: ${player.positionName}`,
      ...(killer === null ? [] : [this.buildStatusLine(killer)]),
      // Set off with a blank line rather than joining the identity lines
      // directly above: characteristics are a different kind of fact about
      // the player than the header's own team/era/race/position. Omitted
      // entirely when no rules set applies to the player's era: there is
      // then no way to know how to write the values, and a wrongly
      // formatted stat line would read as fact.
      ...(characteristicsContext === undefined
        ? []
        : ['', this.buildCharacteristicsLine(player, characteristicsContext)]),
    ];

    const categoryLines = this.eventCountLines.build(
      counts,
      DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
    );

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
        // The position is always-available context about the subject, like the
        // team/era/race entries it sits with, so it joins the header-derived
        // group rather than taking priority over honors and kills. The header
        // line keeps naming the position in text as well: the button is a way
        // in, not the only way to read it.
        {
          customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.positionId),
          label: player.positionName,
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

  /**
   * `Characteristics: MA 7▲ ST 3 AG 3+▲ PA 4+ AV 9+▼` — the player's own
   * current values, written the way their era's rules set writes them, with
   * every characteristic that has moved away from the position's baseline
   * marked. A rules set without a Passing characteristic drops the field
   * rather than showing a placeholder: it does not exist there at all, which
   * is different from existing and being unknown (a stored 0, which renders
   * as a dash). When the rules set carries no baseline for this position,
   * nothing is marked — the values are still worth showing.
   */
  private buildCharacteristicsLine(
    player: Player,
    context: PositionCharacteristicsContext,
  ): string {
    const baseline = context.baseline;
    const fields = [
      `MA ${this.formatCharacteristic(player.move, context.moveFormat, baseline?.move)}`,
      `ST ${this.formatCharacteristic(player.strength, context.strengthFormat, baseline?.strength)}`,
      `AG ${this.formatCharacteristic(player.agility, context.agilityFormat, baseline?.agility)}`,
      ...(context.passingFormat === 'absent'
        ? []
        : [
            `PA ${this.formatCharacteristic(player.passing, context.passingFormat, baseline?.passing)}`,
          ]),
      `AV ${this.formatCharacteristic(player.armour, context.armourFormat, baseline?.armour)}`,
    ];
    return `Characteristics: ${fields.join(' ')}`;
  }

  /** One characteristic: its formatted value plus its baseline marker. */
  private formatCharacteristic(
    value: number | null,
    format: CharacteristicFormat,
    baseline: number | null | undefined,
  ): string {
    return `${this.characteristics.format(value, format)}${this.baselineMarker(value, baseline)}`;
  }

  /**
   * The up/down marker for one characteristic, or the empty string when there
   * is nothing to compare: no baseline at all, or either side missing (a
   * rules set with no Passing characteristic never reaches this, since the
   * field is dropped before formatting). The comparison is on the raw stored
   * numbers rather than the formatted text, so a not-yet-curated 0 is marked
   * as a decrease even though it renders as a dash.
   */
  private baselineMarker(
    value: number | null,
    baseline: number | null | undefined,
  ): string {
    if (value === null || baseline === null || baseline === undefined) {
      return '';
    }
    if (value > baseline) {
      return INCREASED;
    }
    return value < baseline ? DECREASED : '';
  }

  /**
   * The killer clause of the `Status:` line, without the foul note. A
   * `'player'` killer's name is a proper noun and stays capitalized as
   * `describe` returns it; every other kind's phrasing ("An unidentified
   * player from...") is written to stand alone as its own sentence, so its
   * leading capital is lowered to fit mid-sentence after "Killed by ".
   */
  private formatKiller(killer: PlayerKillerInfo): string {
    if (killer.kind === 'unknown') {
      return 'Killed in mysterious circumstances';
    }
    const described = this.killerInfo.describe(killer);
    const clause =
      killer.kind === 'player'
        ? described
        : described.charAt(0).toLowerCase() + described.slice(1);
    return `Killed by ${clause}`;
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
    return killer === null ? [] : this.killerInfo.buildEntries(killer);
  }
}

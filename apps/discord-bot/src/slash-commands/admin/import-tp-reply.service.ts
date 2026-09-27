import type {
  ImportResult,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type {
  TpLiveCompetitionImportResult,
  TpLiveCompetitionTeamResult,
  TpLiveMatchImportResult,
  TpLiveOfficialTeamsImportResult,
  TpLiveOfficialTeamsRulesSetResult,
  TpLiveTeamImportResult,
} from '@blood-bowl-tracker/import-tp-live';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import type { TpImportOutcome } from './tp-import-dispatch.service';

/** One reported stage's bullet: what it is and what it did. */
interface StageRow {
  label: string;
  summary: string;
}

/** One reported error, labelled with the stage it came from. */
interface StageError {
  label: string;
  message: string;
}

/** Everything one import outcome contributes to the reply embed. */
interface ReplySummary {
  title: string;
  /** The import's primary stage imported nothing: a hard failure. */
  failed: boolean;
  /** Lines shown under the status line, such as the era. */
  notes: string[];
  rows: StageRow[];
  errors: StageError[];
}

/** An ImportResult to report under a label. */
interface LabelledResult {
  label: string;
  result: ImportResult;
}

/** The official team list's write stages, in reporting order. */
const OFFICIAL_TEAMS_WRITE_STAGES = [
  { key: 'races', label: 'races' },
  { key: 'positions', label: 'positions' },
  { key: 'characteristics', label: 'characteristics' },
  { key: 'keywords', label: 'keywords' },
  { key: 'startingSkills', label: 'starting skills' },
] as const satisfies readonly {
  key: keyof TpOfficialTeamsImportResult;
  label: string;
}[];

/**
 * Turns a TP import outcome into `/importtp`'s ephemeral reply: one embed
 * with a status line, a bullet per stage and every stage error. A stage
 * error does not make the import a failure — the live imports collect
 * errors rather than throw, so partial success is normal and is reported as
 * "completed with errors". Only the primary stage importing nothing (the
 * competition, the match, the team, or every rules set) is a failure.
 *
 * A backfill the import ran (a new competition's matches and, for a match
 * import, its registered teams) gets its own bullets after the import's own
 * stages.
 *
 * Pure formatting with no dependencies, so specs may pass it real.
 */
@Injectable()
export class ImportTpReplyService {
  build(outcome: TpImportOutcome): InteractionReplyOptions {
    const summary = this.summarize(outcome);
    return {
      embeds: [
        {
          title: summary.title,
          description: this.enforceDescriptionLimit(this.describe(summary)),
        },
      ],
      flags: MessageFlags.Ephemeral,
    };
  }

  private summarize(outcome: TpImportOutcome): ReplySummary {
    switch (outcome.kind) {
      case 'competition':
        return this.competition(outcome.tournamentSlug, outcome.result);
      case 'match':
        return this.match(
          `match ${outcome.matchId} (${outcome.tournamentSlug})`,
          outcome.result,
        );
      case 'roster':
        return this.roster(outcome.rosterId, outcome.result);
      case 'officialTeams':
        return this.officialTeams(outcome.result);
    }
  }

  private competition(
    tournamentSlug: string,
    result: TpLiveCompetitionImportResult,
  ): ReplySummary {
    const head = this.stages([
      { label: 'Competition', result: result.competition },
    ]);
    const teams = this.teams('Teams', result.teams);
    const tail = this.stages([
      { label: 'Participation', result: result.participation },
      { label: 'Trophy awards', result: result.trophyAwards },
      ...this.ranOnly('Matches backfill', result.matchesBackfill),
    ]);
    return {
      title: `TP import: competition ${tournamentSlug}`,
      failed: result.competition.imported === 0,
      notes: [this.eraNote(result.era)],
      rows: [...head.rows, ...teams.rows, ...tail.rows],
      errors: [...head.errors, ...teams.errors, ...tail.errors],
    };
  }

  private match(
    subject: string,
    result: TpLiveMatchImportResult,
  ): ReplySummary {
    const own = this.stages([
      { label: 'Competition', result: result.competition },
      { label: 'Home team', result: result.homeTeam.team },
      { label: 'Home players', result: result.homeTeam.players },
      { label: 'Away team', result: result.awayTeam.team },
      { label: 'Away players', result: result.awayTeam.players },
      { label: 'Star player hires', result: result.starPlayerHires },
      { label: 'Match', result: result.match },
      { label: 'Participation', result: result.participation },
      { label: 'Events', result: result.events },
      { label: 'Outcome', result: result.outcome },
    ]);
    const backfill = this.matchBackfill(result);
    return {
      title: `TP import: ${subject}`,
      failed: result.match.imported === 0,
      notes: [this.eraNote(result.homeTeam.era)],
      rows: [...own.rows, ...backfill.rows],
      errors: [...own.errors, ...backfill.errors],
    };
  }

  /**
   * The competition backfill a match import ran after creating the
   * competition: its registered teams, their participation and awards, and
   * every completed match. Nothing when it ran none.
   */
  private matchBackfill(
    result: TpLiveMatchImportResult,
  ): Pick<ReplySummary, 'rows' | 'errors'> {
    const participants = result.participantsBackfill;
    const parts = [
      ...(participants === undefined
        ? []
        : [
            this.teams('Backfilled teams', participants.teams),
            this.stages([
              {
                label: 'Backfilled participation',
                result: participants.participation,
              },
              {
                label: 'Backfilled trophy awards',
                result: participants.trophyAwards,
              },
            ]),
          ]),
      this.stages(this.ranOnly('Matches backfill', result.matchesBackfill)),
    ];
    return {
      rows: parts.flatMap((part) => part.rows),
      errors: parts.flatMap((part) => part.errors),
    };
  }

  /** One bullet summarizing several live team imports, plus each team's errors. */
  private teams(
    label: string,
    teams: TpLiveCompetitionTeamResult[],
  ): Pick<ReplySummary, 'rows' | 'errors'> {
    const imported = teams.filter((team) => team.team.imported > 0).length;
    const players = teams.reduce((sum, team) => sum + team.players.imported, 0);
    return {
      rows: [
        {
          label,
          summary: `${imported} of ${teams.length} imported, ${players} players`,
        },
      ],
      errors: teams.flatMap((team) => [
        ...this.labelled(`Team ${team.rosterId}`, team.team),
        ...this.labelled(`Team ${team.rosterId} players`, team.players),
      ]),
    };
  }

  /** A stage to report only when it ran. */
  private ranOnly(
    label: string,
    result: ImportResult | undefined,
  ): LabelledResult[] {
    return result === undefined ? [] : [{ label, result }];
  }

  private roster(
    rosterId: number,
    result: TpLiveTeamImportResult,
  ): ReplySummary {
    return {
      title: `TP import: team ${rosterId}`,
      failed: result.team.imported === 0,
      notes: [this.eraNote(result.era)],
      ...this.stages([
        { label: 'Team', result: result.team },
        { label: 'Players', result: result.players },
      ]),
    };
  }

  private officialTeams(result: TpLiveOfficialTeamsImportResult): ReplySummary {
    return {
      title: 'TP import: official teams',
      failed: result.rulesSets.every(
        (rulesSet) => rulesSet.write === undefined,
      ),
      notes: [],
      rows: result.rulesSets.map((rulesSet) => ({
        label: `Rules set ${rulesSet.rulesSet}`,
        summary: this.rulesSetSummary(rulesSet),
      })),
      errors: result.rulesSets.flatMap((rulesSet) => {
        const prefix = `Rules set ${rulesSet.rulesSet}`;
        const { write } = rulesSet;
        return [
          ...this.labelled(`${prefix} fetch`, rulesSet.fetch),
          ...(write === undefined
            ? []
            : OFFICIAL_TEAMS_WRITE_STAGES.flatMap((stage) =>
                this.labelled(`${prefix} ${stage.label}`, write[stage.key]),
              )),
        ];
      }),
    };
  }

  private rulesSetSummary(rulesSet: TpLiveOfficialTeamsRulesSetResult): string {
    const fetched = `fetched ${rulesSet.fetch.imported} races`;
    const { write } = rulesSet;
    if (write === undefined) {
      return `${fetched}, nothing written`;
    }
    const written = OFFICIAL_TEAMS_WRITE_STAGES.map(
      (stage) => `${write[stage.key].imported} ${stage.label}`,
    ).join(', ');
    return `${fetched}; wrote ${written}`;
  }

  /** A bullet per stage, counting what it imported, plus its errors. */
  private stages(
    stages: LabelledResult[],
  ): Pick<ReplySummary, 'rows' | 'errors'> {
    return {
      rows: stages.map(({ label, result }) => ({
        label,
        summary: `${result.imported} imported`,
      })),
      errors: stages.flatMap(({ label, result }) =>
        this.labelled(label, result),
      ),
    };
  }

  private labelled(label: string, result: ImportResult): StageError[] {
    return result.errors.map((error) => ({ label, message: error.message }));
  }

  private eraNote(era: string | undefined): string {
    return `Era: ${era ?? 'not resolved'}`;
  }

  private describe(summary: ReplySummary): string {
    const sections = [
      [this.status(summary), ...summary.notes].join('\n'),
      summary.rows.map((row) => `- ${row.label}: ${row.summary}`).join('\n'),
    ];
    if (summary.errors.length > 0) {
      sections.push(
        [
          '**Errors**',
          ...summary.errors.map(
            (error) => `- ${error.label}: ${error.message}`,
          ),
        ].join('\n'),
      );
    }
    return sections.join('\n\n');
  }

  private status(summary: ReplySummary): string {
    if (summary.failed) {
      return '**Failed**';
    }
    return summary.errors.length > 0
      ? '**Completed with errors**'
      : '**Completed**';
  }

  /**
   * Defense in depth for Discord's embed description limit, the same hard
   * truncation `DebugFilterUsageCommandService.enforceDescriptionLimit` uses:
   * error lists are uncapped, so a large failing import can reach it.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}

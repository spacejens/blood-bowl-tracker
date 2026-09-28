import type {
  ImportResult,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type {
  TpLiveCompetitionImportResult,
  TpLiveCompetitionTeamResult,
  TpLiveMatchImportResult,
  TpLiveMatchTeamsImportResult,
  TpLiveOfficialTeamsImportResult,
  TpLiveOfficialTeamsRulesSetResult,
  TpLiveTeamImportResult,
} from '@blood-bowl-tracker/import-tp-live';
import { Injectable } from '@nestjs/common';

import type { TpImportOutcome } from './tp-import-dispatch.service';

/** One reported stage: what it is and what it did. */
export interface TpImportStageRow {
  label: string;
  summary: string;
}

/** One reported error, labelled with the stage it came from. */
export interface TpImportStageError {
  label: string;
  message: string;
}

/**
 * How an import went: every stage clean, the primary stage imported but
 * some stage reported errors, or the primary stage imported nothing.
 */
export type TpImportStatus = 'completed' | 'completedWithErrors' | 'failed';

/** Everything one import outcome says about itself, ready to render. */
export interface TpImportAssessment {
  /** What was imported, e.g. `match 576264 (s30)`. */
  subject: string;
  status: TpImportStatus;
  /** Lines shown under the status, such as the era. */
  notes: string[];
  rows: TpImportStageRow[];
  errors: TpImportStageError[];
}

/** An assessment before its status is derived. */
interface Summary {
  subject: string;
  /** The import's primary stage imported nothing: a hard failure. */
  failed: boolean;
  notes: string[];
  rows: TpImportStageRow[];
  errors: TpImportStageError[];
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
 * Judges a TP import outcome, the one place that decides what counts as a
 * failure, so every consumer (`/importtp`'s reply, the TP feed) agrees. A
 * stage error does not make the import `failed` — the live imports collect
 * errors rather than throw, so partial success is normal and is
 * `completedWithErrors`. Only the primary stage importing nothing (the
 * competition, the match, the team, or every rules set) is `failed`.
 *
 * Any real failure — `failed` or `completedWithErrors` — is worth a
 * maintainer's attention; `isRealFailure` is that rule.
 *
 * A backfill the import ran (a new competition's matches and, for a match
 * import, its registered teams) gets its own rows after the import's own
 * stages.
 *
 * Pure, with no dependencies, so specs may pass it real.
 */
@Injectable()
export class TpImportFailureService {
  assess(outcome: TpImportOutcome): TpImportAssessment {
    const { failed, ...summary } = this.summarize(outcome);
    return { ...summary, status: this.status(failed, summary.errors) };
  }

  isRealFailure(assessment: TpImportAssessment): boolean {
    return assessment.status !== 'completed';
  }

  private status(
    failed: boolean,
    errors: TpImportStageError[],
  ): TpImportStatus {
    if (failed) {
      return 'failed';
    }
    return errors.length > 0 ? 'completedWithErrors' : 'completed';
  }

  private summarize(outcome: TpImportOutcome): Summary {
    switch (outcome.kind) {
      case 'competition':
        return this.competition(outcome.tournamentSlug, outcome.result);
      case 'match':
        return this.match(
          `match ${outcome.matchId} (${outcome.tournamentSlug})`,
          outcome.result,
        );
      case 'matchTeams':
        return this.matchTeams(
          `teams of match ${outcome.matchId} (${outcome.tournamentSlug})`,
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
  ): Summary {
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
      subject: `competition ${tournamentSlug}`,
      failed: result.competition.imported === 0,
      notes: [this.eraNote(result.era)],
      rows: [...head.rows, ...teams.rows, ...tail.rows],
      errors: [...head.errors, ...teams.errors, ...tail.errors],
    };
  }

  private match(subject: string, result: TpLiveMatchImportResult): Summary {
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
      subject,
      failed: result.match.imported === 0,
      notes: [this.eraNote(result.homeTeam.era)],
      rows: [...own.rows, ...backfill.rows],
      errors: [...own.errors, ...backfill.errors],
    };
  }

  /**
   * Both teams of a match, whatever state the match is in. Both teams are
   * the point, so either not being imported fails it. The match fetch has
   * no row of its own — it never imports anything — but its errors lead.
   */
  private matchTeams(
    subject: string,
    result: TpLiveMatchTeamsImportResult,
  ): Summary {
    const teams = this.stages([
      { label: 'Home team', result: result.homeTeam.team },
      { label: 'Home players', result: result.homeTeam.players },
      { label: 'Away team', result: result.awayTeam.team },
      { label: 'Away players', result: result.awayTeam.players },
    ]);
    return {
      subject,
      failed:
        result.homeTeam.team.imported === 0 ||
        result.awayTeam.team.imported === 0,
      notes: [this.eraNote(result.homeTeam.era)],
      rows: teams.rows,
      errors: [...this.labelled('Match', result.match), ...teams.errors],
    };
  }

  /**
   * The competition backfill a match import ran after creating the
   * competition: its registered teams, their participation and awards, and
   * every completed match. Nothing when it ran none.
   */
  private matchBackfill(
    result: TpLiveMatchImportResult,
  ): Pick<Summary, 'rows' | 'errors'> {
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

  /** One row summarizing several live team imports, plus each team's errors. */
  private teams(
    label: string,
    teams: TpLiveCompetitionTeamResult[],
  ): Pick<Summary, 'rows' | 'errors'> {
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

  private roster(rosterId: number, result: TpLiveTeamImportResult): Summary {
    return {
      subject: `team ${rosterId}`,
      failed: result.team.imported === 0,
      notes: [this.eraNote(result.era)],
      ...this.stages([
        { label: 'Team', result: result.team },
        { label: 'Players', result: result.players },
      ]),
    };
  }

  private officialTeams(result: TpLiveOfficialTeamsImportResult): Summary {
    return {
      subject: 'official teams',
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

  /** A row per stage, counting what it imported, plus its errors. */
  private stages(stages: LabelledResult[]): Pick<Summary, 'rows' | 'errors'> {
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

  private labelled(label: string, result: ImportResult): TpImportStageError[] {
    return result.errors.map((error) => ({ label, message: error.message }));
  }

  private eraNote(era: string | undefined): string {
    return `Era: ${era ?? 'not resolved'}`;
  }
}

import { CoachesQueriesService } from '@blood-bowl-tracker/game-data-queries';
import { Injectable } from '@nestjs/common';

import { PlayerContextService } from '../insights/player-context.service';
import { TeamContextService } from '../insights/team-context.service';
import { DateRangeFormatterService } from '../shared/date-range-formatter.service';

/** One Discord autocomplete suggestion: the label shown and the value sent back. */
export interface AutocompleteChoice {
  name: string;
  value: string;
}

/** An era or competition search hit: its owning league and its own span. */
export interface DatedScopeRow {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
}

/** Discord rejects an autocomplete choice name longer than this. */
const MAX_CHOICE_NAME_LENGTH = 100;

const ELLIPSIS = '…';

/**
 * Builds the autocomplete suggestion labels that need context beyond an
 * entity's own row, so a coach can tell same-named teams, players, coaches,
 * eras and competitions apart. Labels match how the insights toplists
 * identify the same entities: a team by race and coach, a player by the full
 * position/team/race/era/coach set, a coach by career span, and an era or
 * competition by league and date span.
 *
 * Every label is kept within Discord's 100-character limit by cutting from
 * the end, so the context suffix is shortened first and the entity name is
 * only cut when it alone is too long. Missing context falls back to the bare
 * name; a suggestion is never dropped. Each choice's value is the entity id
 * as a string, which is what the commands' resolvers parse back out.
 */
@Injectable()
export class AutocompleteChoiceLabelService {
  constructor(
    private readonly teamContext: TeamContextService,
    private readonly playerContext: PlayerContextService,
    private readonly coachesQueries: CoachesQueriesService,
    private readonly dateRangeFormatter: DateRangeFormatterService,
  ) {}

  async teamChoices(
    rows: { id: number; name: string }[],
  ): Promise<AutocompleteChoice[]> {
    const decorated = await this.teamContext.attachSuffixes(
      rows,
      (row) => row.id,
      { includeRace: true, includeCoach: true },
    );
    return decorated.map((row) =>
      this.choice(row.id, row.name, row.contextSuffix),
    );
  }

  async playerChoices(
    rows: { id: number; name: string }[],
  ): Promise<AutocompleteChoice[]> {
    const decorated = await this.playerContext.attachSuffixes(
      rows,
      (row) => row.id,
      {
        includePosition: true,
        includeTeam: true,
        includeRace: true,
        includeEra: true,
        includeCoach: true,
      },
    );
    return decorated.map((row) =>
      this.choice(row.id, row.name, row.contextSuffix),
    );
  }

  async coachChoices(
    rows: { id: number; name: string }[],
  ): Promise<AutocompleteChoice[]> {
    const spans = await this.coachesQueries.getCareerSpansByIds(
      rows.map((row) => row.id),
    );
    return rows.map((row) => {
      const span = spans.get(row.id);
      const suffix =
        span === undefined
          ? ''
          : ` (${this.dateRangeFormatter.format(span.start, span.end)})`;
      return this.choice(row.id, row.name, suffix);
    });
  }

  datedScopeChoices(rows: DatedScopeRow[]): AutocompleteChoice[] {
    return rows.map((row) =>
      this.choice(
        row.id,
        row.name,
        ` (${row.leagueName}, ${this.dateRangeFormatter.format(row.startDate, row.endDate)})`,
      ),
    );
  }

  private choice(id: number, name: string, suffix: string): AutocompleteChoice {
    return { name: this.fit(`${name}${suffix}`), value: String(id) };
  }

  /**
   * Cuts a label to Discord's limit from the end, marking the cut with an
   * ellipsis. Discord may count the limit in UTF-16 units (as the discord.js
   * validators do with `.length`), which is stricter than counting code
   * points, so the label is measured in UTF-16 units and the cut accumulates
   * whole code points, never splitting a surrogate pair.
   */
  private fit(label: string): string {
    if (label.length <= MAX_CHOICE_NAME_LENGTH) {
      return label;
    }
    let kept = '';
    for (const character of label) {
      if (kept.length + character.length > MAX_CHOICE_NAME_LENGTH - 1) {
        break;
      }
      kept += character;
    }
    return `${kept}${ELLIPSIS}`;
  }
}

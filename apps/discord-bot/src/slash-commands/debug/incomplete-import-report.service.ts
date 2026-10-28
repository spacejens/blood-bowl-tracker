import type { IncompleteImportTeamRow } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';

/** One coach's affected team-eras, already sorted, with their total. */
interface CoachGroup {
  coachName: string;
  total: number;
  teams: IncompleteImportTeamRow[];
}

/** A page being filled: its lines so far and their joined length. */
interface PageDraft {
  lines: string[];
  length: number;
}

/** The state shared while laying coach blocks out across pages. */
interface PagingContext {
  pages: PageDraft[];
  header: string;
  budget: number;
}

/**
 * Lays the `/debugincompleteimport` report out as embed description pages:
 * a totals header on every page, then teams grouped under their coach.
 * Coaches with the most incomplete players come first, and within a coach the
 * team-eras with the most. Pages break between coaches; only a coach whose
 * own block exceeds a page is split, with its heading repeated on the
 * continuation page.
 *
 * Pure and dependency-free; `budget` is a parameter (defaulting to Discord's
 * embed description limit) so specs can exercise page breaks with small data.
 * A single line is bounded by two 255-character names, so header + heading +
 * one team line always fits a 4096-character page.
 */
@Injectable()
export class IncompleteImportReportService {
  buildPages(
    rows: readonly IncompleteImportTeamRow[],
    budget: number = MAX_DESCRIPTION_LENGTH,
  ): string[] {
    if (rows.length === 0) {
      return [];
    }
    const groups = this.groupByCoach(rows);
    const header = this.header(rows, groups.length);
    const context: PagingContext = { pages: [], header, budget };
    this.startPage(context);
    for (const group of groups) {
      this.placeCoach(
        context,
        `${group.coachName} — ${group.total} incomplete`,
        group.teams.map((team) => this.teamLine(team)),
      );
    }
    return context.pages.map((page) => page.lines.join('\n'));
  }

  private groupByCoach(rows: readonly IncompleteImportTeamRow[]): CoachGroup[] {
    const byCoach = new Map<number, CoachGroup>();
    for (const row of rows) {
      const group = byCoach.get(row.coachId) ?? {
        coachName: row.coachName,
        total: 0,
        teams: [],
      };
      group.total += row.incompletePlayerCount;
      group.teams.push(row);
      byCoach.set(row.coachId, group);
    }
    const groups = [...byCoach.values()];
    for (const group of groups) {
      group.teams.sort(
        (a, b) =>
          b.incompletePlayerCount - a.incompletePlayerCount ||
          a.teamName.localeCompare(b.teamName) ||
          a.eraName.localeCompare(b.eraName),
      );
    }
    return groups.sort(
      (a, b) => b.total - a.total || a.coachName.localeCompare(b.coachName),
    );
  }

  private header(
    rows: readonly IncompleteImportTeamRow[],
    coachCount: number,
  ): string {
    const players = rows.reduce(
      (sum, row) => sum + row.incompletePlayerCount,
      0,
    );
    const teams = new Set(rows.map((row) => row.teamId)).size;
    return `Incomplete players: ${players} · Teams: ${teams} · Coaches: ${coachCount}`;
  }

  private teamLine(team: IncompleteImportTeamRow): string {
    return `• ${team.teamName} (${team.raceName}, ${team.eraName}) — ${team.incompletePlayerCount} incomplete`;
  }

  /**
   * Puts one coach's block on the current page if it fits whole, otherwise on
   * a fresh page if it fits there, otherwise splits it line by line,
   * repeating the heading on each continuation page.
   */
  private placeCoach(
    context: PagingContext,
    heading: string,
    teamLines: string[],
  ): void {
    const block = ['', heading, ...teamLines];
    let page = context.pages[context.pages.length - 1];
    if (this.fits(page, block, context.budget)) {
      this.append(page, block);
      return;
    }
    if (page.lines.length > 1) {
      page = this.startPage(context);
      if (this.fits(page, block, context.budget)) {
        this.append(page, block);
        return;
      }
    }
    this.append(page, ['', heading]);
    for (const line of teamLines) {
      if (!this.fits(page, [line], context.budget)) {
        page = this.startPage(context);
        this.append(page, ['', heading]);
      }
      this.append(page, [line]);
    }
  }

  private startPage(context: PagingContext): PageDraft {
    const page = { lines: [context.header], length: context.header.length };
    context.pages.push(page);
    return page;
  }

  /** Whether `lines` fit on `page`, counting one newline before each. */
  private fits(page: PageDraft, lines: string[], budget: number): boolean {
    const added = lines.reduce((sum, line) => sum + 1 + line.length, 0);
    return page.length + added <= budget;
  }

  private append(page: PageDraft, lines: string[]): void {
    for (const line of lines) {
      page.lines.push(line);
      page.length += 1 + line.length;
    }
  }
}

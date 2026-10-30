import type { TpOfficialTeamsStageTiming } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/** How long one `tpOfficialTeams.import` request took. */
export interface OfficialTeamsRequestTiming {
  rulesSet: string;
  /** The race names the request carried, in order. */
  races: string[];
  /** How many positions the request carried. */
  positions: number;
  /** Wall-clock time from sending the request to its result or failure. */
  wallMs: number;
  /**
   * The server's stage durations: undefined when the request failed, empty
   * when the server reported none.
   */
  stages?: TpOfficialTeamsStageTiming[];
}

/**
 * Formats the official team list import's request timings, which
 * tools/import-tp prints at the end of every run, so a slow request can be
 * traced to the rules set, races and server stage it came from.
 */
@Injectable()
export class TpOfficialTeamsTimingReportService {
  /**
   * One header line, then per rules set (first-seen order) its request
   * count and total wall-clock time, then one line per request. No lines
   * when no request was sent.
   */
  summaryLines(timings: OfficialTeamsRequestTiming[]): string[] {
    if (timings.length === 0) {
      return [];
    }
    const lines = ['Official team list import timing:'];
    for (const [rulesSet, requests] of this.byRulesSet(timings)) {
      const total = requests.reduce((sum, request) => sum + request.wallMs, 0);
      lines.push(
        `  ${rulesSet}: ${requests.length} request(s), ${this.ms(total)} wall-clock`,
      );
      requests.forEach((request, index) => {
        lines.push(`    ${this.requestLine(request, index, requests.length)}`);
      });
    }
    return lines;
  }

  private byRulesSet(
    timings: OfficialTeamsRequestTiming[],
  ): Map<string, OfficialTeamsRequestTiming[]> {
    const byRulesSet = new Map<string, OfficialTeamsRequestTiming[]>();
    for (const timing of timings) {
      const requests = byRulesSet.get(timing.rulesSet) ?? [];
      requests.push(timing);
      byRulesSet.set(timing.rulesSet, requests);
    }
    return byRulesSet;
  }

  private requestLine(
    request: OfficialTeamsRequestTiming,
    index: number,
    count: number,
  ): string {
    const head =
      `request ${index + 1}/${count} (${request.races.join(', ')}; ` +
      `${request.positions} positions): ${this.ms(request.wallMs)} wall-clock`;
    if (request.stages === undefined) {
      return `${head}, failed`;
    }
    if (request.stages.length === 0) {
      return `${head}, no stage timings reported`;
    }
    const stages = request.stages
      .map(({ stage, ms }) => `${stage} ${this.ms(ms)}`)
      .join(', ');
    return `${head}; ${stages}`;
  }

  private ms(value: number): string {
    return `${Math.round(value)} ms`;
  }
}

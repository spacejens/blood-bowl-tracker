import { Injectable } from '@nestjs/common';

/**
 * TP's numeric `ruleSet` query value per rules set, by the rules set's
 * canonical name. TP's teams page selects a rules set with a tab whose label
 * is marketing copy ("Blood Bowl Official BB2025 · BB7"), and the only
 * request a tab makes is `rosters/masters?ruleSet=<id>`, so the id is what
 * identifies a rules set to TP. TP publishes both the official BB2025 list
 * and the unofficial "Secret Bowl" one under the same id, in one response;
 * each roster's `teamRosterType` tells them apart. A rules set TP has no id
 * for cannot be fetched, and adding one is a deliberate change here.
 */
const TP_RULES_SET_IDS: readonly { name: string; ruleSetId: number }[] = [
  { name: 'BB2020', ruleSetId: 20 },
  { name: 'DB2021', ruleSetId: 21 },
  { name: 'BB2025', ruleSetId: 25 },
];

/**
 * TP's paths for its official team list, exactly as TP's own teams page
 * requests them: one API path per rules set, relative to TP's backend API
 * base URL, and the teams page path, relative to TP's frontend base URL
 * (sent as the fetch's referer). The one place these paths and the rules-set
 * id map live: tools/download-tp's bulk download and packages/import-tp-live's
 * live fetch both build official-teams requests from it.
 */
@Injectable()
export class TpOfficialTeamsPathsService {
  apiPath(ruleSetId: number): string {
    return `rosters/masters?ruleSet=${ruleSetId}`;
  }

  frontendPath(): string {
    return 'teams';
  }

  /** TP's `ruleSet` id for a rules set name, matched case-insensitively. */
  ruleSetIdFor(rulesSet: string): number | undefined {
    const wanted = rulesSet.toLowerCase();
    return TP_RULES_SET_IDS.find((entry) => entry.name.toLowerCase() === wanted)
      ?.ruleSetId;
  }

  /** Every rules set TP has an id for, by canonical name, oldest first. */
  knownRulesSets(): string[] {
    return TP_RULES_SET_IDS.map((entry) => entry.name);
  }
}

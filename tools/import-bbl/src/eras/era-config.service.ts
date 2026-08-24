import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';
import { eraConfigSchema, leaguesShellSchema } from './era-config.schema';

/**
 * One competition hard-assigned to an era and forced to a type, regardless
 * of match dates. startDate/endDate are only consulted by the competitions
 * import's override path when it finds no match dates to derive a range
 * from; ignored otherwise (an overridden competition that has matches always
 * derives its dates from those instead). endDate is optional; startDate is
 * required only in that no-matches case, so it is optional on the type here
 * -- an override for a competition that does have matches never needs one --
 * but a match-less override with no startDate is skipped at import time with
 * a recorded error.
 */
export interface CompetitionOverride {
  bblId: string;
  type: 'season' | 'cup';
  startDate?: string;
  endDate?: string;
}

export interface EraConfig {
  /**
   * Name of the league this era belongs to, stamped by getEras() from the
   * containing leagues[] entry. Used by the eras import to resolve the era's
   * league id. Optional on the type because hand-built test fixtures may omit
   * it; getEras() always sets it.
   */
  leagueName?: string;
  identity: {
    name: string;
    rulesSets: string[];
  };
  dates: {
    startDate: string;
    endDate?: string;
    /**
     * When false, this era is excluded from the match-date -> era resolution
     * scan (bbl-competitions-import). Its startDate/endDate are still imported
     * into the era DB record. Override lists resolve competitions regardless.
     */
    autoAssignByDate: boolean;
  };
  players: {
    /** Required when autoAssignByPlayerId is true; optional otherwise. */
    firstPlayerId?: number;
    lastPlayerId?: number;
    /**
     * When false, this era is excluded from the pid-range fallback scan
     * (bbl-players-import). Override lists still pin players to the era.
     */
    autoAssignByPlayerId: boolean;
    /**
     * Explicit pids assigned to this era regardless of firstPlayerId/
     * lastPlayerId, for players drafted right at an era boundary whose pid
     * lands on the "wrong" side of the range split. Checked before the range.
     */
    playerIdOverrides?: number[];
  };
  competitions?: {
    /**
     * Competitions hard-assigned to this era and forced to a type, regardless
     * of match dates -- for a competition with a genuinely empty match list,
     * or whose date span would otherwise misclassify its type. Checked
     * before the match-date scan, so unaffected by autoAssignByDate. A
     * competition bblId may appear in only one override, in only one era,
     * across all eras.
     */
    overrides?: CompetitionOverride[];
  };
  teams?: {
    /** Team codes whose players are pinned to this era regardless of pid. */
    teamCodeOverrides?: string[];
  };
  matches?: {
    /**
     * BBL match-id pairs to merge into one match. Per-pair and cross-era
     * uniqueness validation lives in MatchMergeConfigService, which flattens
     * these across all eras — so the entries are carried untyped here.
     * Optional: an era may carry only categoryOverrides.
     */
    merges?: unknown[];
    /**
     * Explicit match-category assignments for matches the keyword classifier
     * cannot recognize (thematic cup finals such as "Bierhallentodball", or
     * stage-like names it deliberately refuses to guess at). Per-entry shape
     * and cross-era uniqueness validation lives in
     * MatchCategoryConfigService, so entries are carried untyped here.
     */
    categoryOverrides?: unknown[];
    /**
     * Explicit match outcomes for matches whose winner cannot be determined
     * from scores plus the source's own placement data (or that the source
     * gets wrong). Per-entry shape and cross-era uniqueness validation lives
     * in MatchResultConfigService, so entries are carried untyped here.
     */
    resultOverrides?: unknown[];
  };
  /**
   * Position availability overrides for this era, for cases where the
   * zero-players heuristic mis-decides a position's availability. The era is
   * implied by the containing era block (no eraId field).
   */
  positions?: {
    /** BBL position typId. */
    positionId: string;
    /** BBL race bblId. */
    raceId: string;
    available: boolean;
  }[];
}

@Injectable()
export class EraConfigService {
  constructor(
    private readonly config: ImportBblConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

  /**
   * The eras the BBL leagues played through, supplied via leagues[].eras in
   * import-bbl-config.json5 (not parsed from the source data). Each league
   * entry's eras are flattened into one list and stamped with that league's
   * leagueName. Each era is six nested groups: identity, dates, players (all
   * required), and optional competitions, teams, matches. See EraConfig for
   * field meanings.
   */
  getEras(): EraConfig[] {
    const leaguesRaw = this.config.get<unknown>('leagues');
    if (leaguesRaw === undefined) {
      throw new Error(
        'leagues is not set in import-bbl-config.json5. Set it to a ' +
          'non-empty array of leagues, each with a leagueName and an eras ' +
          'array, e.g. [{ leagueName: "tLoEG", eras: [ ... ] }].',
      );
    }
    const leagues = leaguesShellSchema.safeParse(leaguesRaw);
    if (!leagues.success) {
      throw new Error(
        leagues.error.issues[0].path.length === 0
          ? 'leagues in import-bbl-config.json5 must be a non-empty array of leagues.'
          : this.messages.format('leagues', leagues.error),
      );
    }

    const eras: EraConfig[] = [];
    leagues.data.forEach((league) => {
      league.eras.forEach((entry, eraIndex) => {
        const parsed = eraConfigSchema.safeParse(entry);
        if (!parsed.success) {
          throw new Error(
            this.messages.format(`BBL_ERAS[${eraIndex}]`, parsed.error),
          );
        }
        this.assertOverriddenCompetitionsUniqueWithinEra(parsed.data, eraIndex);
        eras.push({ ...parsed.data, leagueName: league.leagueName });
      });
    });

    const eraNameSeen = new Map<string, string>();
    for (const era of eras) {
      const existing = eraNameSeen.get(era.identity.name);
      if (existing !== undefined) {
        throw new Error(
          `BBL_ERAS: era name "${era.identity.name}" is used in more than one ` +
            `league (leagues "${existing}" and "${era.leagueName}"). Era names ` +
            `must be unique across all leagues.`,
        );
      }
      // era.leagueName is always set here: every entry in `eras` was just
      // constructed above from a validated, non-empty leagueName.
      eraNameSeen.set(era.identity.name, era.leagueName as string);
    }

    const eraNameByOverriddenPid = new Map<number, string>();
    for (const era of eras) {
      for (const pid of era.players.playerIdOverrides ?? []) {
        const existing = eraNameByOverriddenPid.get(pid);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: player id ${pid} appears in playerIdOverrides for both "${existing}" and "${era.identity.name}".`,
          );
        }
        eraNameByOverriddenPid.set(pid, era.identity.name);
      }
    }

    const eraNameByOverriddenCompetitionId = new Map<string, string>();
    for (const era of eras) {
      for (const override of era.competitions?.overrides ?? []) {
        const existing = eraNameByOverriddenCompetitionId.get(override.bblId);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: competition id ${override.bblId} appears in competitions.overrides for both "${existing}" and "${era.identity.name}".`,
          );
        }
        eraNameByOverriddenCompetitionId.set(override.bblId, era.identity.name);
      }
    }

    const eraNameByOverriddenTeamCode = new Map<string, string>();
    for (const era of eras) {
      for (const teamCode of era.teams?.teamCodeOverrides ?? []) {
        const existing = eraNameByOverriddenTeamCode.get(teamCode);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: team code ${teamCode} appears in teamCodeOverrides for both "${existing}" and "${era.identity.name}".`,
          );
        }
        eraNameByOverriddenTeamCode.set(teamCode, era.identity.name);
      }
    }

    return eras;
  }

  /**
   * A competition id may appear in only one override within a single era.
   * Formerly enforced inside the hand-rolled competitions.overrides parser;
   * now a post-parse business rule, since it is cross-entry (across the
   * overrides array) rather than a single entry's own shape.
   */
  private assertOverriddenCompetitionsUniqueWithinEra(
    era: { competitions?: { overrides?: CompetitionOverride[] } },
    index: number,
  ): void {
    const seenInEra = new Set<string>();
    for (const override of era.competitions?.overrides ?? []) {
      if (seenInEra.has(override.bblId)) {
        throw new Error(
          `BBL_ERAS[${index}].competitions.overrides: competition id ${override.bblId} appears more than once.`,
        );
      }
      seenInEra.add(override.bblId);
    }
  }
}

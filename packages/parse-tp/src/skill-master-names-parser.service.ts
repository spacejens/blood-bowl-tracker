import { Injectable } from '@nestjs/common';

/**
 * One skill master as TP embeds it: its display name and BB2025's orthogonal
 * "elite" marker. TP writes `isElite: true` only on elite skills and omits
 * the field entirely otherwise -- and only BB2025 skill masters ever carry
 * it, so a pre-BB2025 skill is always `false` here.
 */
export interface TpSkillMaster {
  name: string;
  isElite: boolean;
}

/**
 * Harvests `skillMaster: { id, name, isElite? }` records from one
 * already-parsed TP JSON body.
 *
 * TP's per-rules-set template file (`rosters_masters`) names a position's
 * skills only by `skillMasterId` and carries no `skillMaster` object at all
 * -- not even `isElite` -- but every actual team roster and match snapshot
 * embeds the full object wherever a skill appears. Scanning the files already
 * downloaded is therefore what turns those opaque ids into names AND what
 * makes the elite marker visible at all; there is no extra endpoint to call.
 *
 * `isElite` is OR-accumulated across every embedding of the same id, never
 * overwritten: the real mirror embeds the same skill master both in full
 * (`{id: 220, name: "Block", ruleSet: 25, isElite: true}`) and as a partial
 * record that omits both `ruleSet` and `isElite`, so a last-write-wins merge
 * would silently lose eliteness depending on walk order.
 *
 * A recursive walk rather than a zod schema on purpose: `skillMaster` sits at
 * several different nesting depths and inside containers this package does not
 * otherwise model, and anything that is not a well-formed (numeric id, string
 * name) pair is simply skipped.
 */
@Injectable()
export class SkillMasterNamesParserService {
  /**
   * Extracts skill masters from `content`. When `into` is given, walks into
   * that existing accumulator (so its entries take part in the same
   * OR-accumulation as everything found in `content`) and returns it;
   * otherwise starts from a fresh map. This lets a caller that scans several
   * files (`SkillMasterNameCollectionService`) reuse this exact
   * OR-accumulation logic across files instead of re-implementing it.
   */
  extract(
    content: unknown,
    into?: Map<number, TpSkillMaster>,
  ): Map<number, TpSkillMaster> {
    const masters = into ?? new Map<number, TpSkillMaster>();
    this.walk(content, masters);
    return masters;
  }

  private walk(value: unknown, masters: Map<number, TpSkillMaster>): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.walk(item, masters);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    const record = value as Record<string, unknown>;
    const master = record.skillMaster;
    if (master !== null && typeof master === 'object') {
      const { id, name, isElite } = master as {
        id?: unknown;
        name?: unknown;
        isElite?: unknown;
      };
      if (typeof id === 'number' && typeof name === 'string' && name !== '') {
        const existing = masters.get(id);
        masters.set(id, {
          name,
          isElite: (existing?.isElite ?? false) || isElite === true,
        });
      }
    }
    for (const child of Object.values(record)) {
      this.walk(child, masters);
    }
  }
}

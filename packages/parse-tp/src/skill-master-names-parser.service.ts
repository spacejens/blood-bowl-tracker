import { Injectable } from '@nestjs/common';

/**
 * Harvests `skillMaster: { id, name }` pairs from one already-parsed TP JSON
 * body.
 *
 * TP's per-rules-set template file (`rosters_masters`) names a position's
 * skills only by `skillMasterId`, but every actual team roster and match
 * snapshot embeds the full `skillMaster` object wherever a skill appears --
 * so scanning the files already downloaded is what turns those opaque ids
 * into names, with no extra endpoint to call.
 *
 * A recursive walk rather than a zod schema on purpose: `skillMaster` sits at
 * several different nesting depths and inside containers this package does not
 * otherwise model, and anything that is not a well-formed (numeric id, string
 * name) pair is simply skipped.
 */
@Injectable()
export class SkillMasterNamesParserService {
  extract(content: unknown): Map<number, string> {
    const names = new Map<number, string>();
    this.walk(content, names);
    return names;
  }

  private walk(value: unknown, names: Map<number, string>): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.walk(item, names);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    const record = value as Record<string, unknown>;
    const master = record.skillMaster;
    if (master !== null && typeof master === 'object') {
      const { id, name } = master as { id?: unknown; name?: unknown };
      if (typeof id === 'number' && typeof name === 'string' && name !== '') {
        names.set(id, name);
      }
    }
    for (const child of Object.values(record)) {
      this.walk(child, names);
    }
  }
}

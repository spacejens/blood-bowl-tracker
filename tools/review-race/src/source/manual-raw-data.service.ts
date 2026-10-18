import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import { RaceReviewConfigService } from '../config/review-race-config.service';

/** The external-id system the curated keyword catalogue keys its TP code by. */
const TOURPLAY_SYSTEM = 'tourplay.net';

/** A `{ system, id }` reference, as the curated files write them. */
export interface ManualExternalIdRef {
  system: string;
  id: string;
}

/** One `races[]` entry of races-and-positions.json5. */
export interface ManualRaceEntry {
  name: string;
  externalIds: ManualExternalIdRef[];
}

/** One `positions[]` entry of position-availability.json5. */
export interface ManualAvailabilityEntry {
  name: string;
  externalIds: ManualExternalIdRef[];
  raceEras: { race: ManualExternalIdRef; era: ManualExternalIdRef }[];
}

/** One `positionRulesSets[]` entry of either characteristics file. */
export interface ManualCharacteristicsEntry {
  position: ManualExternalIdRef;
  rulesSet: ManualExternalIdRef;
  move: number | null;
  strength: number | null;
  agility: number | null;
  /** null when the entry omits `passing` (a passing-absent rules set). */
  passing: number | null;
  armour: number | null;
}

/**
 * One skill of a `positionRulesSetSkills[]` entry. The curated file writes
 * most skills as a plain `{ system, id }` ref (attributeValue: null), and a
 * skill with a roll target (e.g. Secret Weapon) as `{ skill: { system, id },
 * attributeValue }` instead.
 */
export interface ManualPositionSkillRef {
  skill: ManualExternalIdRef;
  attributeValue: string | null;
}

/** One `positionRulesSetSkills[]` entry of position-skills.json5. */
export interface ManualPositionSkillsEntry {
  position: ManualExternalIdRef;
  rulesSet: ManualExternalIdRef;
  skills: ManualPositionSkillRef[];
}

/** One `keywords[]` entry of keywords.json5. */
export interface ManualKeywordEntry {
  name: string;
  kind: string;
  /** The entry's `tourplay.net` external id, null when it carries none. */
  code: string | null;
}

/**
 * Reads the hand-curated data the race/position review checks against: every
 * top-level section of every `.json5` file in every batch under
 * `<manual.dataDir>/batches/`, pooled in batch-name order and, within a batch,
 * filename order -- the order tools/import-manual applies them in. When a
 * later batch restates an entry with the same key (its external-id set, or its
 * position and rules set), the later one wins, in the earlier one's place.
 * Deliberately independent of tools/import-manual: this reads and shapes the
 * files, and runs none of the importer's processor logic -- that logic's
 * reading of these files is part of what the report exists to check.
 *
 * A missing or malformed file degrades to an empty list, so one broken
 * curated file shows up as an empty raw sub-panel rather than failing the run.
 */
@Injectable()
export class ManualRawDataService {
  private pooled: Promise<Map<string, unknown[]>> | undefined;

  constructor(private readonly config: RaceReviewConfigService) {}

  async races(): Promise<ManualRaceEntry[]> {
    const entries = (await this.section('races')).flatMap((entry) => {
      const name = this.string(entry, 'name');
      return name === null
        ? []
        : [{ name, externalIds: this.refs(entry, 'externalIds') }];
    });
    return this.latestByKey(entries, (e) => this.refsKey(e.externalIds));
  }

  /** The `positions` entries that state race/era availability. */
  async availability(): Promise<ManualAvailabilityEntry[]> {
    const entries = (await this.section('positions'))
      .filter((entry) => this.property(entry, 'raceEras') !== undefined)
      .flatMap((entry) => {
        const name = this.string(entry, 'name');
        return name === null
          ? []
          : [
              {
                name,
                externalIds: this.refs(entry, 'externalIds'),
                raceEras: this.raceEras(entry),
              },
            ];
      });
    return this.latestByKey(entries, (e) => this.refsKey(e.externalIds));
  }

  /**
   * Every curated `positionRulesSets` entry, across every batch.
   */
  async characteristics(): Promise<ManualCharacteristicsEntry[]> {
    const entries = (await this.section('positionRulesSets')).flatMap(
      (entry) => {
        const position = this.ref(this.property(entry, 'position'));
        const rulesSet = this.ref(this.property(entry, 'rulesSet'));
        if (position === null || rulesSet === null) {
          return [];
        }
        return [
          {
            position,
            rulesSet,
            move: this.number(entry, 'move'),
            strength: this.number(entry, 'strength'),
            agility: this.number(entry, 'agility'),
            passing: this.number(entry, 'passing'),
            armour: this.number(entry, 'armour'),
          },
        ];
      },
    );
    return this.latestByKey(entries, (e) =>
      this.pairKey(e.position, e.rulesSet),
    );
  }

  /**
   * Every curated starting-skill entry: the hand-written answer for the rules
   * sets no importer supplies (CRP, CRP+, BB2016). Read by this tool's own
   * batch reader, running none of tools/import-manual's loader logic — that
   * logic's reading of this file is part of what the report exists to check.
   */
  async positionSkills(): Promise<ManualPositionSkillsEntry[]> {
    const entries = (await this.section('positionRulesSetSkills')).flatMap(
      (entry) => {
        const position = this.ref(this.property(entry, 'position'));
        const rulesSet = this.ref(this.property(entry, 'rulesSet'));
        if (position === null || rulesSet === null) {
          return [];
        }
        return [{ position, rulesSet, skills: this.positionSkillRefs(entry) }];
      },
    );
    return this.latestByKey(entries, (e) =>
      this.pairKey(e.position, e.rulesSet),
    );
  }

  /**
   * The curated BB2025 keyword catalogue: every `keywords[]` entry, with its
   * `tourplay.net` external id (if any) pulled out as `code` — that id is
   * what lets the TP raw panel turn a numeric code into a name. Read by this
   * tool's own batch reader, running none of tools/import-manual's loader
   * logic — that logic's reading of this file is part of what the report
   * exists to check.
   */
  async keywords(): Promise<ManualKeywordEntry[]> {
    const entries = (await this.section('keywords')).flatMap((entry) => {
      const name = this.string(entry, 'name');
      const kind = this.string(entry, 'kind');
      if (name === null || kind === null) {
        return [];
      }
      return [
        {
          key: this.refsKey(this.refs(entry, 'externalIds')),
          keyword: { name, kind, code: this.tourplayCode(entry) },
        },
      ];
    });
    return this.latestByKey(entries, (e) => e.key).map((e) => e.keyword);
  }

  /** An entry's `tourplay.net` external id, or null when it carries none. */
  private tourplayCode(entry: unknown): string | null {
    const tp = this.refs(entry, 'externalIds').find(
      (ref) => ref.system === TOURPLAY_SYSTEM,
    );
    return tp?.id ?? null;
  }

  /**
   * Curated `skills[]` entries carry either a plain `{ system, id }` ref
   * (attributeValue: null) or a wrapped `{ skill: { system, id },
   * attributeValue }` for a skill with a roll target (e.g. Secret Weapon).
   */
  private positionSkillRefs(entry: unknown): ManualPositionSkillRef[] {
    const raw = this.property(entry, 'skills');
    return (Array.isArray(raw) ? raw : []).flatMap((value) => {
      const plain = this.ref(value);
      if (plain !== null) {
        return [{ skill: plain, attributeValue: null }];
      }
      const wrapped = this.ref(this.property(value, 'skill'));
      if (wrapped === null) {
        return [];
      }
      const attributeValue = this.string(value, 'attributeValue');
      return [{ skill: wrapped, attributeValue }];
    });
  }

  private raceEras(
    entry: unknown,
  ): { race: ManualExternalIdRef; era: ManualExternalIdRef }[] {
    const raw = this.property(entry, 'raceEras');
    return (Array.isArray(raw) ? raw : []).flatMap((pair) => {
      const race = this.ref(this.property(pair, 'race'));
      const era = this.ref(this.property(pair, 'era'));
      return race === null || era === null ? [] : [{ race, era }];
    });
  }

  private refs(entry: unknown, key: string): ManualExternalIdRef[] {
    const raw = this.property(entry, key);
    return (Array.isArray(raw) ? raw : []).flatMap((value) => {
      const ref = this.ref(value);
      return ref === null ? [] : [ref];
    });
  }

  private ref(value: unknown): ManualExternalIdRef | null {
    const system = this.string(value, 'system');
    const id = this.property(value, 'id');
    if (system === null || (typeof id !== 'string' && typeof id !== 'number')) {
      return null;
    }
    return { system, id: String(id) };
  }

  private string(value: unknown, key: string): string | null {
    const property = this.property(value, key);
    return typeof property === 'string' && property !== '' ? property : null;
  }

  private number(value: unknown, key: string): number | null {
    const property = this.property(value, key);
    return typeof property === 'number' ? property : null;
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }

  /** An entry's identity by its external ids: '' when it has none. */
  private refsKey(refs: ManualExternalIdRef[]): string {
    return refs
      .map((ref) => `${ref.system}|${ref.id}`)
      .sort()
      .join(',');
  }

  private pairKey(
    position: ManualExternalIdRef,
    rulesSet: ManualExternalIdRef,
  ): string {
    return `${position.system}|${position.id}::${rulesSet.system}|${rulesSet.id}`;
  }

  /**
   * One entry per key, the last one read winning in the first one's place.
   * An entry whose key is '' (no external ids) has no identity to match on,
   * so it is always kept.
   */
  private latestByKey<T>(entries: T[], keyOf: (entry: T) => string): T[] {
    const byKey = new Map<string, T>();
    entries.forEach((entry, index) => {
      const key = keyOf(entry);
      byKey.set(key === '' ? `#${index}` : key, entry);
    });
    return [...byKey.values()];
  }

  /** Every entry of one top-level section, across every batch, in order. */
  private async section(key: string): Promise<unknown[]> {
    this.pooled ??= this.loadBatches();
    return (await this.pooled).get(key) ?? [];
  }

  /**
   * Every top-level array section of every `.json5` file of every batch
   * directory under `<manual.dataDir>/batches/`, read once per process.
   */
  private async loadBatches(): Promise<Map<string, unknown[]>> {
    const root = join(this.config.getDataDir('manual'), 'batches');
    const pooled = new Map<string, unknown[]>();
    for (const batch of await this.names(root, (e) => e.isDirectory())) {
      const dir = join(root, batch);
      for (const file of await this.names(dir, (e) =>
        e.name.endsWith('.json5'),
      )) {
        const contents = await this.load(join(dir, file));
        for (const [key, value] of Object.entries(contents)) {
          if (Array.isArray(value)) {
            pooled.set(key, [
              ...(pooled.get(key) ?? []),
              ...(value as unknown[]),
            ]);
          }
        }
      }
    }
    return pooled;
  }

  /** The sorted names of `dir`'s entries passing `keep`; none if unreadable. */
  private async names(
    dir: string,
    keep: (entry: Dirent) => boolean,
  ): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter(keep)
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  /** One file, JSON5-parsed; {} when it is missing, malformed or no object. */
  private async load(path: string): Promise<Record<string, unknown>> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return {};
    }
    try {
      const parsed: unknown = JSON5.parse(raw);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}

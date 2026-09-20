import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import { RaceReviewConfigService } from '../config/review-race-config.service';

const RACES_AND_POSITIONS_FILE = join(
  'before-other-importers',
  'races-and-positions.json5',
);
const AVAILABILITY_FILE = join(
  'after-other-importers',
  'position-availability.json5',
);
const CHARACTERISTICS_FILE = join(
  'after-other-importers',
  'position-characteristics.json5',
);
const GAP_FILL_CHARACTERISTICS_FILE = join(
  'before-other-importers',
  'position-characteristics-gap-fill.json5',
);
const POSITION_SKILLS_FILE = join(
  'after-other-importers',
  'position-skills.json5',
);
const KEYWORDS_FILE = join('before-other-importers', 'keywords.json5');

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
 * Reads the six hand-curated JSON5 files (races-and-positions, availability,
 * characteristics, gap-fill characteristics, position-skills, keywords) the
 * race/position review checks against. Deliberately independent of
 * tools/import-manual: this reads and
 * shapes the files, and runs none of the importer's processor logic — that
 * logic's reading of these files is part of what the report exists to check.
 *
 * A missing or malformed file degrades to an empty list, so one broken
 * curated file shows up as an empty raw sub-panel rather than failing the run.
 */
@Injectable()
export class ManualRawDataService {
  private files = new Map<string, Promise<Record<string, unknown>>>();

  constructor(private readonly config: RaceReviewConfigService) {}

  async races(): Promise<ManualRaceEntry[]> {
    const entries = await this.array(RACES_AND_POSITIONS_FILE, 'races');
    return entries.flatMap((entry) => {
      const name = this.string(entry, 'name');
      return name === null
        ? []
        : [{ name, externalIds: this.refs(entry, 'externalIds') }];
    });
  }

  async availability(): Promise<ManualAvailabilityEntry[]> {
    const entries = await this.array(AVAILABILITY_FILE, 'positions');
    return entries.flatMap((entry) => {
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
  }

  /**
   * Every curated `positionRulesSets` entry, pooled from the two files that
   * declare them: the after-phase `position-characteristics.json5` and the
   * before-phase `position-characteristics-gap-fill.json5`. Each file is read
   * and shaped independently, by its own hardcoded path -- this tool
   * deliberately runs none of tools/import-manual's own loader logic, since
   * that logic's reading of these files is part of what the report exists to
   * check.
   */
  async characteristics(): Promise<ManualCharacteristicsEntry[]> {
    const [curated, gapFill] = await Promise.all([
      this.characteristicsFrom(CHARACTERISTICS_FILE),
      this.characteristicsFrom(GAP_FILL_CHARACTERISTICS_FILE),
    ]);
    return [...curated, ...gapFill];
  }

  /**
   * Every curated starting-skill entry: the hand-written answer for the rules
   * sets no importer supplies (CRP, CRP+, BB2016). Read by this tool's own
   * hardcoded path, running none of tools/import-manual's loader logic — that
   * logic's reading of this file is part of what the report exists to check.
   */
  async positionSkills(): Promise<ManualPositionSkillsEntry[]> {
    const entries = await this.array(
      POSITION_SKILLS_FILE,
      'positionRulesSetSkills',
    );
    return entries.flatMap((entry) => {
      const position = this.ref(this.property(entry, 'position'));
      const rulesSet = this.ref(this.property(entry, 'rulesSet'));
      if (position === null || rulesSet === null) {
        return [];
      }
      return [{ position, rulesSet, skills: this.positionSkillRefs(entry) }];
    });
  }

  /**
   * The curated BB2025 keyword catalogue: every `keywords[]` entry, with its
   * `tourplay.net` external id (if any) pulled out as `code` — that id is
   * what lets the TP raw panel turn a numeric code into a name. Read by this
   * tool's own hardcoded path, running none of tools/import-manual's loader
   * logic — that logic's reading of this file is part of what the report
   * exists to check.
   */
  async keywords(): Promise<ManualKeywordEntry[]> {
    const entries = await this.array(KEYWORDS_FILE, 'keywords');
    return entries.flatMap((entry) => {
      const name = this.string(entry, 'name');
      const kind = this.string(entry, 'kind');
      if (name === null || kind === null) {
        return [];
      }
      return [{ name, kind, code: this.tourplayCode(entry) }];
    });
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

  /** One characteristics file's `positionRulesSets` entries. */
  private async characteristicsFrom(
    file: string,
  ): Promise<ManualCharacteristicsEntry[]> {
    const entries = await this.array(file, 'positionRulesSets');
    return entries.flatMap((entry) => {
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

  private async array(file: string, key: string): Promise<unknown[]> {
    const contents = await this.file(file);
    const raw = contents[key];
    return (Array.isArray(raw) ? raw : []) as unknown[];
  }

  /** Read and JSON5-parse one curated file, once per process. */
  private file(relativePath: string): Promise<Record<string, unknown>> {
    const cached = this.files.get(relativePath);
    if (cached !== undefined) {
      return cached;
    }
    const loading = this.load(relativePath);
    this.files.set(relativePath, loading);
    return loading;
  }

  private async load(relativePath: string): Promise<Record<string, unknown>> {
    const path = join(this.config.getDataDir('manual'), relativePath);
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

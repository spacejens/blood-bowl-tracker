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

/** One `positionRulesSets[]` entry of position-characteristics.json5. */
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
 * Reads the three hand-curated JSON5 files the race/position review checks
 * against. Deliberately independent of tools/import-manual: this reads and
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

  async characteristics(): Promise<ManualCharacteristicsEntry[]> {
    const entries = await this.array(CHARACTERISTICS_FILE, 'positionRulesSets');
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

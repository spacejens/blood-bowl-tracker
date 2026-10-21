import { join } from 'node:path';

import {
  ManualBatchReaderService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';

/** A `{ system, id }` reference, as the curated files write them. */
export interface ManualExternalIdRef {
  system: string;
  id: string;
}

/** One star `positions[]` entry of star-players.json5. */
export interface ManualStarPlayerEntry {
  name: string;
  externalIds: ManualExternalIdRef[];
}

/** One `positions[]` entry of position-availability.json5. */
export interface ManualAvailabilityEntry {
  name: string;
  externalIds: ManualExternalIdRef[];
  raceEras: { race: ManualExternalIdRef; era: ManualExternalIdRef }[];
}

/** One `keywords[]` entry of keywords.json5. */
export interface ManualKeywordEntry {
  name: string;
  kind: string;
  /** The entry's `tourplay.net` external id, null when it carries none. */
  code: string | null;
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
 * Reads the hand-curated data this review checks against: the top-level
 * sections of every curated batch under `<manual.dataDir>/batches/`, pooled by
 * the shared `ManualBatchReaderService` in batch-name order and, within a
 * batch, filename order -- the order tools/import-manual applies them in. When
 * a later batch restates an entry with the same key (its external-id set, or
 * its position and rules set), the later one wins, in the earlier one's place.
 * The shared reader only walks, parses and pools the files; every reading of
 * what an entry means happens here. Deliberately independent of
 * tools/import-manual: this reads and shapes the files, and runs none of the
 * importer's processor logic -- that logic's reading of these files is part of
 * what the report exists to check.
 *
 * A missing or malformed file degrades to an empty list, so one broken
 * curated file shows up as an empty raw sub-panel rather than failing the run.
 */
@Injectable()
export class ManualRawDataService {
  constructor(
    private readonly config: StarPlayerReviewConfigService,
    private readonly batches: ManualBatchReaderService,
  ) {}

  /** The curated star player entries (`isStarPlayer: true`), identity only. */
  async starPlayers(): Promise<ManualStarPlayerEntry[]> {
    const entries = (await this.batchSection('positions')).flatMap((entry) => {
      const name = this.string(entry, 'name');
      if (name === null || this.property(entry, 'isStarPlayer') !== true) {
        return [];
      }
      return [{ name, externalIds: this.refs(entry, 'externalIds') }];
    });
    return this.batches.latestByKey(entries, (e) =>
      this.refsKey(e.externalIds),
    );
  }

  /** The `positions` entries that state race/era availability. */
  async availability(): Promise<ManualAvailabilityEntry[]> {
    const entries = (await this.batchSection('positions'))
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
    return this.batches.latestByKey(entries, (e) =>
      this.refsKey(e.externalIds),
    );
  }

  /**
   * Every curated `positionRulesSets` entry, across every batch. Star entries
   * reference their position by its bare name, so a caller filters by
   * matching the star's own `Name` external id.
   */
  async characteristics(): Promise<ManualCharacteristicsEntry[]> {
    const entries = (await this.batchSection('positionRulesSets')).flatMap(
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
    return this.batches.latestByKey(entries, (e) =>
      this.pairKey(e.position, e.rulesSet),
    );
  }

  /**
   * The curated BB2025 keyword catalogue: every `keywords[]` entry, with its
   * `tourplay.net` external id (if any) pulled out as `code` -- that id is
   * what lets the TP raw panel turn a numeric code into a name. Written
   * again in this tool's own terms, per the independence rule -- shaped here,
   * running none of tools/import-manual's loader logic, which is part of what
   * the report exists to check.
   */
  async keywords(): Promise<ManualKeywordEntry[]> {
    const entries = (await this.batchSection('keywords')).flatMap((entry) => {
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
    return this.batches
      .latestByKey(entries, (e) => e.key)
      .map((e) => e.keyword);
  }

  /** Every entry of one top-level section, across every curated batch. */
  private batchSection(key: string): Promise<unknown[]> {
    return this.batches.section(
      join(this.config.getDataDir('manual'), 'batches'),
      key,
    );
  }

  /** An entry's `tourplay.net` external id, or null when it carries none. */
  private tourplayCode(entry: unknown): string | null {
    const tp = this.refs(entry, 'externalIds').find(
      (ref) => ref.system === TP_EXTERNAL_SYSTEM_NAME,
    );
    return tp?.id ?? null;
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
}

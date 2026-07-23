import type { ExternalSystemCategory } from '@blood-bowl-tracker/api-contract';
import { ExternalSystemsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type {
  ExternalRef,
  ManualDataFile,
} from '../data-file/manual-data-file.schema';

/** Every distinct external-system name referenced anywhere in the pooled data. */
function collectSystemNames(data: ManualDataFile): string[] {
  const names = new Set<string>();
  const add = (ref: ExternalRef): void => {
    names.add(ref.system);
  };
  const addAll = (refs: readonly ExternalRef[]): void => refs.forEach(add);

  for (const entry of data.externalSystems) {
    names.add(entry.name);
  }
  for (const entry of data.rulesSets) {
    addAll(entry.externalIds);
  }
  for (const entry of data.leagues) {
    addAll(entry.externalIds);
  }
  for (const entry of data.eras) {
    addAll(entry.externalIds);
    add(entry.league);
    addAll(entry.rulesSets);
  }
  for (const entry of data.races) {
    addAll(entry.externalIds);
    addAll(entry.eras);
  }
  for (const entry of data.positions) {
    addAll(entry.externalIds);
    for (const raceEra of entry.raceEras) {
      add(raceEra.race);
      add(raceEra.era);
    }
  }
  for (const entry of data.coaches) {
    addAll(entry.externalIds);
  }
  for (const entry of data.teams) {
    addAll(entry.externalIds);
    add(entry.race);
    add(entry.coach);
    addAll(entry.eras);
  }
  return [...names];
}

/**
 * Every declared system's category, by name. Throws if the same name is
 * declared twice with conflicting categories — the pooled data comes from
 * every `.json5` file in a directory, so the same well-known system (e.g.
 * "Name") is commonly declared in more than one file and must agree.
 */
function collectCategories(
  data: ManualDataFile,
): Map<string, ExternalSystemCategory> {
  const categories = new Map<string, ExternalSystemCategory>();
  for (const entry of data.externalSystems) {
    const existing = categories.get(entry.name);
    if (existing !== undefined && existing !== entry.category) {
      throw new Error(
        `External system "${entry.name}" is declared with conflicting categories: "${existing}" and "${entry.category}"`,
      );
    }
    categories.set(entry.name, entry.category);
  }
  return categories;
}

@Injectable()
export class ExternalSystemsProcessor {
  constructor(
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Bootstrap every external system referenced in the pooled data, returning a
   * name -> id map. Every referenced name must have a matching entry in the
   * pooled `externalSystems` list declaring its category — an undeclared name
   * throws rather than guessing, since a wrong guess (e.g. miscategorizing a
   * referenced-only system as an imported data source) would silently corrupt
   * statistics that depend on the category. Upserts are sequential; the first
   * failure rejects, aborting the run (a bootstrap that can't reach the API
   * can't import anything).
   */
  async bootstrap(data: ManualDataFile): Promise<Map<string, number>> {
    const categories = collectCategories(data);
    const systemIds = new Map<string, number>();
    for (const name of collectSystemNames(data)) {
      const category = categories.get(name);
      if (category === undefined) {
        throw new Error(
          `External system "${name}" is referenced but not declared in externalSystems`,
        );
      }
      systemIds.set(
        name,
        await this.externalSystemsImport.upsertExternalSystem(name, category),
      );
    }
    return systemIds;
  }
}

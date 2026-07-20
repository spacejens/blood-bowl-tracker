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

@Injectable()
export class ExternalSystemsProcessor {
  constructor(
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Bootstrap every external system referenced in the pooled data, returning a
   * name -> id map. Upserts are sequential; the first failure rejects, aborting
   * the run (a bootstrap that can't reach the API can't import anything).
   */
  async bootstrap(data: ManualDataFile): Promise<Map<string, number>> {
    const systemIds = new Map<string, number>();
    for (const name of collectSystemNames(data)) {
      systemIds.set(
        name,
        await this.externalSystemsImport.upsertExternalSystem(name),
      );
    }
    return systemIds;
  }
}

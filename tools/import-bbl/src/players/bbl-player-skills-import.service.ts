import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  PlayerSkillsImportService,
  SkillsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { BblPlayerSkillRef } from './player-page-parser';

/**
 * Writes every scraped player's own skills, starting and gained alike.
 *
 * BBL names a skill only by its display text, so each distinct name is
 * upserted under its synthetic "Name" external id -- the same mechanism that
 * makes BBL, TP and the curated files land on one skill row, and exactly what
 * `StartingSkillsImportService` does for a position's starting skills. A name
 * is upserted at most once per run and its failure cached, so one bad skill is
 * reported once rather than once per player holding it.
 *
 * BBL-local rather than shared because the parsed ref shape is BBL's own; the
 * shared piece is `PlayerSkillsImportService`, consumed unchanged and called
 * exactly once for the whole run.
 */
@Injectable()
export class BblPlayerSkillsImportService {
  constructor(
    private readonly skillsImport: SkillsImportService,
    private readonly playerSkills: PlayerSkillsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  async syncPlayerSkills(
    skillsByPlayerId: Map<number, BblPlayerSkillRef[]>,
  ): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    if (skillsByPlayerId.size === 0) {
      return { result: this.importResults.result({ imported: 0, errors }) };
    }

    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported: 0, errors }) };
    }
    const [nameSystemId] = bootstrap.ids;

    /** Skill name -> its database id, or undefined when its upsert failed. */
    const skillIdsByName = new Map<string, number | undefined>();
    const entries: PlayerSkillEntry[] = [];
    for (const [playerId, refs] of skillsByPlayerId) {
      for (const ref of refs) {
        const skillId = await this.resolveSkillId({
          name: ref.name,
          nameSystemId,
          skillIdsByName,
          errors,
        });
        if (skillId === undefined) {
          continue;
        }
        entries.push({
          playerId,
          skillId,
          source: ref.source,
          attributeValue: ref.attributeValue ?? null,
          ...(ref.advancementOrder === undefined
            ? {}
            : { advancementOrder: ref.advancementOrder }),
        });
      }
    }

    const imported = await this.playerSkills.syncPlayerSkills(entries, errors);
    return { result: this.importResults.result({ imported, errors }) };
  }

  /** One skill's database id, upserted at most once per run. */
  private async resolveSkillId(options: {
    name: string;
    nameSystemId: number;
    skillIdsByName: Map<string, number | undefined>;
    errors: ImportError[];
  }): Promise<number | undefined> {
    const { name, nameSystemId, skillIdsByName, errors } = options;
    if (skillIdsByName.has(name)) {
      return skillIdsByName.get(name);
    }
    const upserted = await this.skillsImport.upsert(
      {
        name,
        externalIds: [
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forSkill(name),
          },
        ],
      },
      errors,
    );
    // A failed upsert already recorded its own error; caching undefined keeps
    // it from being retried (and re-reported) for every other player.
    const id = upserted?.id;
    skillIdsByName.set(name, id);
    return id;
  }
}

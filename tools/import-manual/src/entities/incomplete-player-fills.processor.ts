import type {
  FillAdvancement,
  FillIncompletePlayer,
} from '@blood-bowl-tracker/api-contract';
import { IncompletePlayerFillImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type {
  ExternalRef,
  IncompletePlayerFillEntry,
} from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class IncompletePlayerFillsProcessor {
  constructor(
    private readonly refResolver: ReferenceResolverService,
    private readonly fills: IncompletePlayerFillImportService,
  ) {}

  /**
   * Fill in each listed TP player's missing data (see
   * docs/import-manual/filling-missing-players.md). The player and every
   * skill resolve by external id like every other reference here; an
   * unresolved one skips the entry with an ImportError. Each entry goes to
   * `players.fillIncomplete` on its own, so the server checks it against
   * what is stored and refuses it, writing nothing, when it contradicts
   * that; a refusal is recorded as an ImportError and the other entries
   * still run. An advancement listed without a source goes as
   * `advancement`, which never replaces a stored chosen or random source.
   * Returns how many entries the server accepted, re-runs it found
   * unchanged included.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.incompletePlayerFills) {
      const payload = await this.payload(entry, ctx);
      if (payload === undefined) {
        continue;
      }
      if ((await this.fills.fill(payload, ctx.errors)) !== undefined) {
        imported += 1;
      }
    }
    return imported;
  }

  /** The fill to send, or undefined when a reference fails. */
  private async payload(
    entry: IncompletePlayerFillEntry,
    ctx: ProcessContext,
  ): Promise<FillIncompletePlayer | undefined> {
    const common = {
      systemIds: ctx.systemIds,
      errors: ctx.errors,
      item: entry,
      label: `Cannot fill in player ${entry.player.system} ${entry.player.id}`,
    };
    const playerId = await this.refResolver.resolveRef({
      ...common,
      ref: entry.player,
      kind: 'player',
    });
    if (playerId === undefined) {
      return undefined;
    }
    const starting = entry.startingSkills.map(
      (skill): { ref: ExternalRef; attributeValue: string | null } =>
        'skill' in skill
          ? { ref: skill.skill, attributeValue: skill.attributeValue }
          : { ref: skill, attributeValue: null },
    );
    const gainedRefs = entry.advancements.flatMap((advancement) =>
      'skill' in advancement ? [advancement.skill] : [],
    );
    const skillIds = await this.refResolver.resolveRefs({
      ...common,
      refs: [...starting.map((skill) => skill.ref), ...gainedRefs],
      kind: 'skill',
    });
    if (skillIds === undefined) {
      return undefined;
    }
    let nextSkill = starting.length;
    const advancements = entry.advancements.map(
      (advancement): FillAdvancement => {
        if (!('skill' in advancement)) {
          return {
            kind: 'characteristic',
            characteristic: advancement.characteristic,
          };
        }
        const skillId = skillIds[nextSkill];
        nextSkill += 1;
        return {
          kind: 'skill',
          skillId,
          attributeValue: advancement.attributeValue ?? null,
          source: advancement.source ?? 'advancement',
          isFreeExtra: advancement.freeExtra ?? false,
        };
      },
    );
    const { ma, st, ag, pa, av } = entry.characteristics;
    return {
      playerId,
      status: entry.status,
      characteristics: {
        move: ma,
        strength: st,
        agility: ag,
        passing: pa ?? null,
        armour: av,
      },
      sppTotal: entry.sppTotal,
      unspentSpp: entry.unspentSpp,
      startingSkills: starting.map((skill, at) => ({
        skillId: skillIds[at],
        attributeValue: skill.attributeValue,
      })),
      advancements,
    };
  }
}

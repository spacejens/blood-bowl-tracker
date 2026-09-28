import type {
  ImportError,
  PlayerSkillEntry,
  PlayerSkillSource,
  TpImportedPlayer,
} from '@blood-bowl-tracker/api-contract';
import { PlayerSkillsService } from '@blood-bowl-tracker/game-data';
import type {
  TpPlayerSkillRef,
  TpPlayerSkills,
  TpRoster,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpKeywordTargetDecoderService } from '../../official-teams/tp-keyword-target-decoder.service';
import type { TpOfficialKeywordCatalog } from '../../official-teams/tp-official-keyword-catalog.service';
import { TpOfficialKeywordCatalogService } from '../../official-teams/tp-official-keyword-catalog.service';
import { TpImportResultsService } from '../../tp-import-results.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { TpRosterContext } from '../tp-roster-context.service';
import type { TpResolvedSkill } from './tp-roster-skill-ids.service';
import { TpRosterSkillIdsService } from './tp-roster-skill-ids.service';

/** TP's attribute type for an opaque keyword code (Hatred/Animosity targets). */
const KEYWORD_CODE_ATTRIBUTE_TYPE = 3;

/** Options for {@link TpRosterPlayerSkillsService.syncPlayerSkills}. */
export interface SyncRosterPlayerSkillsOptions {
  roster: TpRoster;
  /** The roster's raw TP JSON, scanned for the skill masters it names. */
  content: unknown;
  /** Each imported player's TP `lineUpId` and database player id. */
  importedPlayers: TpImportedPlayer[];
  context: TpRosterContext;
  errors: ImportError[];
}

/** One imported roster player that carries a skills group. */
interface PlayerWithSkills {
  player: TpRosterPlayer;
  playerId: number;
  skills: TpPlayerSkills;
}

/** What every entry of one call is built against. */
interface SkillsRun {
  skillsByMasterId: Map<number, TpResolvedSkill>;
  catalog: TpOfficialKeywordCatalog;
  /** `skillMasterId:attributeValue` pairs already reported as uncurated. */
  reportedTypeThreeRefs: Set<string>;
  errors: ImportError[];
}

/** One raw reference, and how the player came by it. */
interface SkillRefEntry {
  playerId: number;
  ref: TpPlayerSkillRef;
  source: PlayerSkillSource;
  advancementOrder?: number;
}

/**
 * Writes one live-imported roster's players' own skills, starting and gained
 * alike -- the live counterpart of tools/import-tp's player-skills pass. A
 * `starting` entry is the position template's; a gained one is `random` or
 * `chosen` from TP's own `isRandom`, with `advancementOrder` its 1-based index
 * in TP's gained list (TP's presentation order, the best proxy it exposes).
 * Only a roster entry with a skills group contributes: a match-snapshot-only
 * player carries none.
 */
@Injectable()
export class TpRosterPlayerSkillsService {
  constructor(
    private readonly skillIds: TpRosterSkillIdsService,
    private readonly keywordCatalog: TpOfficialKeywordCatalogService,
    private readonly keywordTargets: TpKeywordTargetDecoderService,
    private readonly playerSkills: PlayerSkillsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Resolves every referenced skill once for the whole roster, then writes
   * each imported player's skills in one `player_skills` sync per player, so
   * one player's failed write never loses another's. A skill that cannot be
   * resolved, or whose keyword-code target is uncurated, is left out with
   * one error; the player's other skills are still written. Returns how many
   * entries were written.
   */
  async syncPlayerSkills({
    roster,
    content,
    importedPlayers,
    context,
    errors,
  }: SyncRosterPlayerSkillsOptions): Promise<number> {
    const withSkills = this.playersWithSkills(roster.players, importedPlayers);
    if (withSkills.length === 0) {
      return 0;
    }
    const refs = withSkills.flatMap(({ skills }) => [
      ...skills.starting,
      ...skills.gained,
    ]);
    const run: SkillsRun = {
      skillsByMasterId: await this.skillIds.resolve({
        masterIds: new Set(refs.map((ref) => ref.skillMasterId)),
        content,
        rosterId: roster.id,
        context,
        errors,
      }),
      // Read only when some reference needs it: most rosters have no
      // keyword-code target at all.
      catalog: refs.some(
        (ref) => ref.attributeType === KEYWORD_CODE_ATTRIBUTE_TYPE,
      )
        ? await this.keywordCatalog.load({
            tpSystemId: context.tpSystemId,
            errors,
          })
        : { byCode: new Map() },
      reportedTypeThreeRefs: new Set(),
      errors,
    };

    let written = 0;
    for (const { player, playerId, skills } of withSkills) {
      const entries = this.deduplicate([
        ...skills.starting.flatMap((ref) =>
          this.entry(run, { playerId, ref, source: 'starting' }),
        ),
        ...skills.gained.flatMap((ref, index) =>
          this.entry(run, {
            playerId,
            ref,
            source: ref.isRandom ? 'random' : 'chosen',
            advancementOrder: index + 1,
          }),
        ),
      ]);
      if (entries.length === 0) {
        continue;
      }
      const synced = await this.runner.record({
        run: () => this.playerSkills.sync({ entries }),
        item: { lineUpId: player.id, playerId },
        errors,
        buildErrorMessage: (error) =>
          `Failed to write ${entries.length} skill(s) of player "${player.name}" (${player.id}): ${this.runner.messageOf(error)}`,
      });
      if (synced !== undefined) {
        written += entries.length;
      }
    }
    return written;
  }

  /** Every roster player that was imported and carries a skills group. */
  private playersWithSkills(
    players: TpRosterPlayer[],
    importedPlayers: TpImportedPlayer[],
  ): PlayerWithSkills[] {
    const playerIds = new Map(
      importedPlayers.map((imported) => [imported.lineUpId, imported.playerId]),
    );
    return players.flatMap((player) => {
      const playerId = playerIds.get(player.id);
      return playerId === undefined || player.skills === undefined
        ? []
        : [{ player, playerId, skills: player.skills }];
    });
  }

  /**
   * One reference as a `player_skills` entry, or none when its skill did not
   * resolve (already reported) or its keyword-code target is uncurated.
   */
  private entry(
    run: SkillsRun,
    { playerId, ref, source, advancementOrder }: SkillRefEntry,
  ): PlayerSkillEntry[] {
    const skill = run.skillsByMasterId.get(ref.skillMasterId);
    if (skill === undefined) {
      return [];
    }
    const attribute = this.attributeValue(run, { ref, skill });
    if (attribute === undefined) {
      return [];
    }
    return [
      {
        playerId,
        skillId: skill.skillId,
        source,
        attributeValue: attribute.value,
        ...(advancementOrder === undefined ? {} : { advancementOrder }),
      },
    ];
  }

  /**
   * The attribute value one reference contributes. Types other than 3 are
   * directly composable; type 3 is an opaque keyword code, decoded through
   * the curated catalogue -- an uncurated one drops the skill, reported once
   * per (skillMasterId, value) pair across the roster.
   */
  private attributeValue(
    run: SkillsRun,
    { ref, skill }: { ref: TpPlayerSkillRef; skill: TpResolvedSkill },
  ): { value: string | null } | undefined {
    if (ref.attributeValue === undefined) {
      return { value: null };
    }
    if (ref.attributeType !== KEYWORD_CODE_ATTRIBUTE_TYPE) {
      return { value: ref.attributeValue };
    }
    const target = this.keywordTargets.decode({
      skillMasterId: ref.skillMasterId,
      attributeValue: ref.attributeValue,
      catalog: run.catalog,
    });
    if (target !== undefined) {
      return { value: target };
    }
    const key = `${ref.skillMasterId}:${ref.attributeValue}`;
    if (!run.reportedTypeThreeRefs.has(key)) {
      run.reportedTypeThreeRefs.add(key);
      run.errors.push(
        this.importResults.error({
          item: {
            skillMasterId: ref.skillMasterId,
            attributeValue: ref.attributeValue,
          },
          message:
            `TP skill ${ref.skillMasterId} (${skill.name}) names keyword ` +
            `code "${ref.attributeValue}" as its target, and no curated ` +
            'keyword carries that code, so it is left out of that ' +
            "player's skills. Curate it in tools/import-manual " +
            '(data/before-other-importers/keywords.json5).',
        }),
      );
    }
    return undefined;
  }

  /**
   * One player's entries, one per `(skillId, attributeValue)` -- the natural
   * key `player_skills` is unique on, which `PlayerSkillsService.sync`
   * rejects a batch for repeating. A gained entry replaces a starting one
   * (the more specific provenance); otherwise the first entry wins, which
   * for two gained entries is the lower advancement order, since entries
   * arrive starting first, then gained in order.
   */
  private deduplicate(entries: PlayerSkillEntry[]): PlayerSkillEntry[] {
    const byKey = new Map<string, PlayerSkillEntry>();
    for (const entry of entries) {
      const key = JSON.stringify([entry.skillId, entry.attributeValue]);
      const existing = byKey.get(key);
      if (
        existing === undefined ||
        (existing.source === 'starting' && entry.source !== 'starting')
      ) {
        byKey.set(key, entry);
      }
    }
    return [...byKey.values()];
  }
}

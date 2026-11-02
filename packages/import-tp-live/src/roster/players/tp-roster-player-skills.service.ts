import type {
  ImportError,
  PlayerSkillEntry,
  TpImportedPlayer,
  UnspentSppSnapshot,
} from '@blood-bowl-tracker/api-contract';
import type {
  PlayerCharacteristicCounts,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { PlayerSkillsService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
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
import type { TpRosterContext } from '../tp-roster-context.service';
import { TpAdvancementOrderService } from './tp-advancement-order.service';
import { TpLiveAdvancementSyncService } from './tp-live-advancement-sync.service';
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
  /** Each imported player's characteristic increases, by database player id. */
  increasesByPlayerId: ReadonlyMap<number, PlayerCharacteristicCounts>;
  /**
   * When true (the live import only), each player's entries go through
   * TpLiveAdvancementSyncService, which confirms the order of new
   * advancements where it is known.
   */
  confirmNewAdvancements?: boolean;
  context: TpRosterContext;
  errors: ImportError[];
}

/** One imported roster player that carries a skills group or increases. */
interface PlayerWithSkills {
  player: TpRosterPlayer;
  playerId: number;
  /** Empty for a player with increases but no skills group. */
  skills: TpPlayerSkills;
  increases: PlayerCharacteristicCounts | undefined;
  /** TP's unspent figure for the player, with the total reported beside it. */
  snapshot: UnspentSppSnapshot | undefined;
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
  /** TP flags the skill as granted on top of the player's advancements. */
  isFreeExtra?: boolean;
}

/**
 * Writes one imported roster's players' own advancement rows, starting and
 * gained skills alike plus characteristic increases, for both the live import
 * and the bulk `tpRosters.import` path. A `starting` entry is the position
 * template's; a gained one is `random` or `chosen` from TP's own `isRandom`,
 * with `advancementOrder` its 1-based index in TP's gained list (TP's
 * presentation order, the best proxy it exposes). A gained skill TP flags
 * `isExtra` is sent as a free extra (`isFreeExtra`). Increases travel with
 * the skills in the same sync, stating the player's increases in full: the
 * bulk import sends them with an unknown order, while the live import hands
 * each player to TpLiveAdvancementSyncService, which orders new advancements
 * after the stored ones. Only a roster entry with a skills group or derived
 * increases contributes: a match-snapshot-only player carries neither.
 */
@Injectable()
export class TpRosterPlayerSkillsService {
  constructor(
    private readonly skillIds: TpRosterSkillIdsService,
    private readonly keywordCatalog: TpOfficialKeywordCatalogService,
    private readonly keywordTargets: TpKeywordTargetDecoderService,
    private readonly playerSkills: PlayerSkillsService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
    private readonly order: TpAdvancementOrderService,
    private readonly liveSync: TpLiveAdvancementSyncService,
  ) {}

  /**
   * Resolves every referenced skill once for the whole roster, then writes
   * each imported player's skills and increases in one `player_advancements`
   * sync per player, so one player's failed write never loses another's. A
   * skill that cannot be resolved, or whose keyword-code target is uncurated,
   * is left out with one error; the player's other skills are still written.
   * Returns how many skill entries were written.
   */
  async syncPlayerSkills({
    roster,
    content,
    importedPlayers,
    increasesByPlayerId,
    confirmNewAdvancements,
    context,
    errors,
  }: SyncRosterPlayerSkillsOptions): Promise<number> {
    const withSkills = this.playersWithSkills({
      players: roster.players,
      importedPlayers,
      increasesByPlayerId,
    });
    if (withSkills.length === 0) {
      return 0;
    }
    const refs = withSkills.flatMap(({ skills }) => [
      ...skills.starting,
      ...skills.gained,
    ]);
    const run: SkillsRun = {
      // Nothing to resolve when every player carries only increases.
      skillsByMasterId:
        refs.length === 0
          ? new Map<number, TpResolvedSkill>()
          : await this.skillIds.resolve({
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
    for (const {
      player,
      playerId,
      skills,
      increases,
      snapshot,
    } of withSkills) {
      const skillEntries = this.deduplicate([
        ...skills.starting.flatMap((ref) =>
          this.entry(run, { playerId, ref, source: 'starting' }),
        ),
        ...skills.gained.flatMap((ref, index) =>
          this.entry(run, {
            playerId,
            ref,
            source: ref.isRandom ? 'random' : 'chosen',
            advancementOrder: index + 1,
            isFreeExtra: ref.isExtra,
          }),
        ),
      ]);
      if (skillEntries.length === 0 && increases === undefined) {
        continue;
      }
      if (confirmNewAdvancements === true) {
        const wrote = await this.liveSync.syncPlayer({
          player: { id: player.id, name: player.name },
          playerId,
          skillEntries,
          increases,
          snapshot,
          errors,
        });
        if (wrote) {
          written += skillEntries.length;
        }
        continue;
      }
      const entries = [
        ...skillEntries,
        ...this.order.characteristicEntries(playerId, increases),
      ];
      const synced = await this.runner.record({
        run: () =>
          this.playerSkills.sync({
            entries,
            ...(increases === undefined
              ? {}
              : { characteristicPlayerIds: [playerId] }),
          }),
        item: { lineUpId: player.id, playerId },
        errors,
        buildErrorMessage: (error) =>
          `Failed to write ${entries.length} advancement(s) of player "${player.name}" (${player.id}): ${this.runner.messageOf(error)}`,
      });
      if (synced !== undefined) {
        written += skillEntries.length;
      }
    }
    return written;
  }

  /**
   * Every roster player that was imported and carries a skills group or
   * derived increases, with TP's unspent figure for them.
   */
  private playersWithSkills({
    players,
    importedPlayers,
    increasesByPlayerId,
  }: {
    players: TpRosterPlayer[];
    importedPlayers: TpImportedPlayer[];
    increasesByPlayerId: ReadonlyMap<number, PlayerCharacteristicCounts>;
  }): PlayerWithSkills[] {
    const imported = new Map(
      importedPlayers.map((entry) => [entry.lineUpId, entry]),
    );
    return players.flatMap((player) => {
      const entry = imported.get(player.id);
      if (entry === undefined) {
        return [];
      }
      const increases = increasesByPlayerId.get(entry.playerId);
      if (player.skills === undefined && increases === undefined) {
        return [];
      }
      return [
        {
          player,
          playerId: entry.playerId,
          skills: player.skills ?? { starting: [], gained: [] },
          increases,
          snapshot: entry.unspentSppSnapshot,
        },
      ];
    });
  }

  /**
   * One reference as a `player_advancements` entry, or none when its skill did not
   * resolve (already reported) or its keyword-code target is uncurated.
   */
  private entry(
    run: SkillsRun,
    { playerId, ref, source, advancementOrder, isFreeExtra }: SkillRefEntry,
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
        ...(isFreeExtra === true ? { isFreeExtra: true } : {}),
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
            '(keywords.json5 in a new batch under data/batches/).',
        }),
      );
    }
    return undefined;
  }

  /**
   * One player's entries, one per `(skillId, attributeValue)` -- the natural
   * key `player_advancements` is unique on, which `PlayerSkillsService.sync`
   * rejects a batch for repeating. A gained entry replaces a starting one
   * (the more specific provenance); otherwise the first entry wins, which
   * for two gained entries is the lower advancement order, since entries
   * arrive starting first, then gained in order. The kept entry is a free extra
   * when any merged entry was.
   */
  private deduplicate(entries: PlayerSkillEntry[]): PlayerSkillEntry[] {
    const byKey = new Map<string, PlayerSkillEntry>();
    for (const entry of entries) {
      const key = JSON.stringify([entry.skillId, entry.attributeValue]);
      const existing = byKey.get(key);
      const winner =
        existing === undefined ||
        (existing.source === 'starting' && entry.source !== 'starting')
          ? entry
          : existing;
      // A merged row is free when any of its entries was.
      const free = entry.isFreeExtra === true || existing?.isFreeExtra === true;
      byKey.set(key, free ? { ...winner, isFreeExtra: true } : winner);
    }
    return [...byKey.values()];
  }
}

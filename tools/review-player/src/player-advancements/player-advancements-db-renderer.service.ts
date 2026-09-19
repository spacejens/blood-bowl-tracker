import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  desc,
  eq,
  eraRulesSets,
  externalSystems,
  inArray,
  players,
  playerSkills,
  rulesSets,
  skillExternalIds,
  skillRulesSets,
  skills,
  teamEras,
} from '@blood-bowl-tracker/db';
import type { TableRow } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';

const NONE = '—';
const NOT_IN_RAW = 'not in the raw source';
const RAW_ONLY = 'in the raw source only';

/**
 * The external-id system every entity's curated name-based identity lives
 * under, including a skill's alternate spellings (see `skillExternalIds`).
 */
const NAME_SYSTEM = 'Name';

/** One stored `player_skills` row, joined to its skill and rules-set flags. */
interface StoredSkill {
  skillId: number;
  skillName: string;
  source: string;
  attributeValue: string | null;
  advancementOrder: number | null;
  isElite: boolean;
}

/**
 * What the importers stored for this player: every `player_skills` row and
 * the five `*IncreaseCount` columns, beside the raw source's own list.
 *
 * **Rules-set resolution.** `players` carries no rules-set id and
 * `era_rules_sets` is many-to-many, so the era's LAST-LISTED rules set is
 * taken (`order by era_rules_sets.id desc limit 1`) — the same insertion-order
 * heuristic `PlayerCharacteristicsDbRendererService` uses, and for the same
 * reason: this tool must not read the importers' configs. It matters here
 * only for the elite flag, which is per rules set.
 *
 * **Markers.** A starting skill is always plain — random and elite are
 * advancement-only concepts. A gained skill (`advancement`, `chosen` or
 * `random`) takes the dice marker when its source is `random` and the diamond
 * when the skill is elite under that rules set; both can apply at once.
 *
 * **The raw comparison** is against the same source the player was sampled
 * through, read through the same services the raw panel uses. Import curates
 * alternate spellings of a skill's name onto one canonical skill (e.g. TP's
 * "Bone Head" and the stored "Bone-Head" both resolve to the same skill), so
 * matching by exact name string would flag every such curation as a false
 * mismatch. Instead, a raw name is resolved through `skills_external_ids`
 * (the `Name` system) to the skill id it curates onto, and rows are matched by
 * that id — falling back to a plain name match only when a raw name has no
 * curated `Name` external id at all. A stored skill the source does not have
 * is highlighted, and a source skill that was never stored is appended as its
 * own highlighted row. Every highlighted row also says so in words, so the
 * report stays readable without colour.
 *
 * Increase counts are compared only for a BBL-sourced player: BBL publishes
 * real per-characteristic markers, TP publishes none at all (its raw panel
 * shows a derived template diff instead), and no importer writes these
 * columns from TP — flagging that would be noise, not a finding.
 */
@Injectable()
export class PlayerAdvancementsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly bbl: BblPlayerAdvancementsReaderService,
    private readonly tp: TpRawPlayerSkillsIndexService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const stored = await this.storedPlayer(player.playerId);
    if (stored === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }
    const rulesSet = await this.rulesSetFor(stored.eraId);
    if (rulesSet === undefined) {
      return this.html.note(
        `Era "${player.eraName}" maps to no rules set, so elite status cannot be resolved.`,
      );
    }
    const skillRows = await this.storedSkills(
      player.playerId,
      rulesSet.rulesSetId,
    );
    const rawNames = await this.rawSkillNames(player);
    const rawSkillIdByName = await this.resolveRawSkillIds(
      rawNames === null ? [] : [...rawNames],
    );
    return (
      this.html.subheading(`Skills (${rulesSet.rulesSetName})`) +
      this.html.table(
        ['Skill', 'Source', 'Order', 'Raw source'],
        this.skillRows(skillRows, rawNames, rawSkillIdByName),
      ) +
      this.html.subheading('Characteristic increases') +
      (await this.increases(player, stored))
    );
  }

  /** One row per stored skill, then one per raw skill nothing stored. */
  private skillRows(
    skillRows: StoredSkill[],
    rawNames: Set<string> | null,
    rawSkillIdByName: Map<string, number>,
  ): TableRow[] {
    const storedNames = new Set(skillRows.map((row) => row.skillName));
    const storedSkillIds = new Set(skillRows.map((row) => row.skillId));
    const matchesRaw = (row: StoredSkill): boolean => {
      for (const name of rawNames ?? []) {
        if (
          name === row.skillName ||
          rawSkillIdByName.get(name) === row.skillId
        ) {
          return true;
        }
      }
      return false;
    };
    const rows: TableRow[] = skillRows.map((row) => {
      const found = rawNames !== null && matchesRaw(row);
      const cells = [
        this.format(row),
        row.source,
        row.advancementOrder === null ? NONE : String(row.advancementOrder),
        rawNames === null ? 'not read' : found ? 'yes' : NOT_IN_RAW,
      ];
      // Cell 3 is the raw-source column, so that is the differing cell.
      return rawNames !== null && !found
        ? this.html.highlight(cells, [3])
        : cells;
    });
    for (const name of rawNames ?? []) {
      const resolvedId = rawSkillIdByName.get(name);
      const accountedFor =
        resolvedId === undefined
          ? storedNames.has(name)
          : storedSkillIds.has(resolvedId);
      if (!accountedFor) {
        rows.push(this.html.highlight([name, NONE, NONE, RAW_ONLY], [3]));
      }
    }
    return rows;
  }

  /**
   * Resolves a batch of raw skill names to the skill id each curates onto,
   * via `skills_external_ids`' `Name` system. A raw name with no such row is
   * simply absent from the returned map — the caller falls back to a plain
   * name match for it.
   */
  private async resolveRawSkillIds(
    rawNames: readonly string[],
  ): Promise<Map<string, number>> {
    if (rawNames.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        externalId: skillExternalIds.externalId,
        skillId: skillExternalIds.skillId,
      })
      .from(skillExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, skillExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(externalSystems.name, NAME_SYSTEM),
          inArray(skillExternalIds.externalId, [...rawNames]),
        ),
      );
    return new Map(rows.map((row) => [row.externalId, row.skillId]));
  }

  private format(row: StoredSkill): string {
    const gained = row.source !== 'starting';
    return this.skillFormat.format({
      name: row.skillName,
      attributeValue: row.attributeValue,
      isRandom: gained && row.source === 'random',
      isElite: gained && row.isElite,
    });
  }

  /** The five stored counts, compared against BBL's own where there are any. */
  private async increases(
    player: SampledPlayer,
    stored: {
      moveIncreaseCount: number;
      strengthIncreaseCount: number;
      agilityIncreaseCount: number;
      passingIncreaseCount: number;
      armourIncreaseCount: number;
    },
  ): Promise<string> {
    const counts = [
      stored.moveIncreaseCount,
      stored.strengthIncreaseCount,
      stored.agilityIncreaseCount,
      stored.passingIncreaseCount,
      stored.armourIncreaseCount,
    ];
    const headers = ['MA', 'ST', 'AG', 'PA', 'AV'];
    if (player.source !== 'bbl') {
      return (
        this.html.table(headers, [counts.map((count) => String(count))]) +
        this.html.note(
          'TP publishes no advancement counts, so nothing is compared here; the raw panel shows a derived template difference instead.',
        )
      );
    }
    const raw = await this.bbl.read(player.externalId);
    if (raw === null) {
      return this.html.table(headers, [counts.map((count) => String(count))]);
    }
    const rawCounts = [
      raw.increaseCounts.move,
      raw.increaseCounts.strength,
      raw.increaseCounts.agility,
      raw.increaseCounts.passing,
      raw.increaseCounts.armour,
    ];
    const differing = counts.flatMap((count, index) =>
      count === rawCounts[index] ? [] : [index],
    );
    const cells = counts.map((count, index) =>
      count === rawCounts[index]
        ? String(count)
        : `${count} (raw: ${rawCounts[index]})`,
    );
    return this.html.table(headers, [
      differing.length === 0 ? cells : this.html.highlight(cells, differing),
    ]);
  }

  /** The raw source's skill names, or null when the source has no data. */
  private async rawSkillNames(
    player: SampledPlayer,
  ): Promise<Set<string> | null> {
    if (player.source === 'bbl') {
      const raw = await this.bbl.read(player.externalId);
      return raw === null
        ? null
        : new Set(raw.skills.map((skill) => skill.name));
    }
    const raw = await this.tp.advancementsFor(player.externalId);
    if (raw === null) {
      return null;
    }
    return new Set(
      [...raw.startingSkills, ...raw.gainedSkills].flatMap((skill) =>
        skill.name === null ? [] : [skill.name],
      ),
    );
  }

  private async storedPlayer(playerId: number) {
    const rows = await this.db
      .select({
        positionId: players.positionId,
        eraId: teamEras.eraId,
        moveIncreaseCount: players.moveIncreaseCount,
        strengthIncreaseCount: players.strengthIncreaseCount,
        agilityIncreaseCount: players.agilityIncreaseCount,
        passingIncreaseCount: players.passingIncreaseCount,
        armourIncreaseCount: players.armourIncreaseCount,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .where(eq(players.id, playerId));
    return rows[0];
  }

  private async rulesSetFor(eraId: number) {
    const rows = await this.db
      .select({ rulesSetId: rulesSets.id, rulesSetName: rulesSets.name })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .where(eq(eraRulesSets.eraId, eraId))
      .orderBy(desc(eraRulesSets.id))
      .limit(1);
    return rows[0];
  }

  /**
   * The player's stored skills. Elite comes from a LEFT join, so a skill with
   * no `skill_rules_sets` row for the resolved rules set still renders — just
   * without the marker.
   */
  private async storedSkills(
    playerId: number,
    rulesSetId: number,
  ): Promise<StoredSkill[]> {
    const rows = await this.db
      .select({
        skillId: playerSkills.skillId,
        skillName: skills.name,
        source: playerSkills.source,
        attributeValue: playerSkills.attributeValue,
        advancementOrder: playerSkills.advancementOrder,
        isElite: skillRulesSets.isElite,
      })
      .from(playerSkills)
      .innerJoin(skills, eq(skills.id, playerSkills.skillId))
      .leftJoin(
        skillRulesSets,
        and(
          eq(skillRulesSets.skillId, playerSkills.skillId),
          eq(skillRulesSets.rulesSetId, rulesSetId),
        ),
      )
      .where(eq(playerSkills.playerId, playerId))
      .orderBy(asc(skills.name));
    return rows.map((row) => ({ ...row, isElite: row.isElite === true }));
  }
}

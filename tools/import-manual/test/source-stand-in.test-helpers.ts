/// <reference types="node" />
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import type { ExternalId } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  eq,
  eras,
  externalSystems,
  players,
  positionRulesSets,
  positionRulesSetSkills,
  rulesSets,
  skillRulesSets,
} from '@blood-bowl-tracker/db';

import {
  BATCH_001,
  readFile,
} from '../src/data-file/curated-data.test-helpers';

interface CuratedRef {
  name: string;
  externalIds: { system: string; id: string }[];
}

type CuratedKind =
  'coach' | 'competition' | 'skill' | 'race' | 'position' | 'team';

/** A curated entry that must carry a name (a competition's is optional). */
function named(
  entry: { name?: string } & Omit<CuratedRef, 'name'>,
): CuratedRef {
  if (entry.name === undefined) {
    throw new Error('the picked curated entry has no name');
  }
  return { name: entry.name, externalIds: entry.externalIds };
}

/** One real curated entry per entity whose name the manual importer owns. */
export function curatedPicks(): Record<CuratedKind, CuratedRef> {
  const racesAndPositions = readFile(BATCH_001, 'races-and-positions.json5');
  return {
    coach: readFile(BATCH_001, 'coaches.json5').coaches[0],
    competition: named(
      readFile(BATCH_001, 'competitions.json5').competitions[0],
    ),
    skill: readFile(BATCH_001, 'skills.json5').skills[0],
    race: racesAndPositions.races[0],
    position: racesAndPositions.positions[0],
    team: readFile(BATCH_001, 'teams.json5').teams[0],
  };
}

/** What the stand-in observed, compared across the two runs. */
export interface StandInOutcome {
  /** Each curated entity's stored name after a source re-sent a raw one. */
  namesAfterRawUpsert: Record<CuratedKind, string>;
  /** The stand-in position's Agility after BBL then TP wrote it. */
  agility: number;
  /** The stand-in starting skill's attribute value after BBL then TP. */
  attributeValue: string | null;
  /** The stand-in player's spp_total after the adjustments step. */
  sppTotal: number | null;
}

type ExternalIds = ExternalId[];

/** The ids of the stored external systems, by name. */
async function systemIds(db: Db): Promise<Map<string, number>> {
  return new Map(
    (await db.select().from(externalSystems)).map((s) => [s.name, s.id]),
  );
}

/** A curated entry's external ids, resolved against the stored systems. */
function resolveIds(
  systems: Map<string, number>,
  ref: CuratedRef,
): ExternalIds {
  return ref.externalIds.map((r) => {
    const externalSystemId = systems.get(r.system);
    if (externalSystemId === undefined) {
      throw new Error(`external system "${r.system}" not imported`);
    }
    return { externalSystemId, externalId: r.id };
  });
}

/**
 * Re-sends every curated pick under a raw source spelling and without
 * `renameExisting`, as BBL and TP do, and returns the names the server
 * kept, plus the race and coach ids the synthetic team needs.
 */
async function resendRawNames(
  client: ApiClient,
  systems: Map<string, number>,
): Promise<{
  names: Record<CuratedKind, string>;
  raceId: number;
  coachId: number;
}> {
  const picks = curatedPicks();
  const raw = (kind: CuratedKind) => ({
    name: `${picks[kind].name} (source spelling)`,
    externalIds: resolveIds(systems, picks[kind]),
  });
  const coach = await client.coaches.upsert(raw('coach'));
  const competition = await client.competitions.upsert(raw('competition'));
  const skill = await client.skills.upsert(raw('skill'));
  const race = await client.races.upsert(raw('race'));
  const position = await client.positions.upsert(raw('position'));
  const team = await client.teams.upsert(raw('team'));
  return {
    names: {
      coach: coach.name,
      competition: competition.name,
      skill: skill.name,
      race: race.name,
      position: position.name,
      team: team.name,
    },
    raceId: race.id,
    coachId: coach.id,
  };
}

/**
 * A characteristics line and a starting skill for a synthetic position,
 * written BBL-style (insert-only) then TP-style (overwriting), on a rules
 * set BBL and TP both describe (plus-notation Agility) and a skill curated
 * under it. Returns the position's id.
 */
async function writeCharacteristics(
  client: ApiClient,
  db: Db,
  tpId: (externalId: string) => ExternalIds,
): Promise<number> {
  const [rulesSet] = await db
    .select({ id: rulesSets.id, passingFormat: rulesSets.passingFormat })
    .from(rulesSets)
    .where(eq(rulesSets.agilityFormat, 'plus'))
    .orderBy(rulesSets.id)
    .limit(1);
  const [skillRow] = await db
    .select({ skillId: skillRulesSets.skillId })
    .from(skillRulesSets)
    .where(eq(skillRulesSets.rulesSetId, rulesSet.id))
    .orderBy(skillRulesSets.skillId)
    .limit(1);
  const position = await client.positions.upsert({
    name: 'Stand-in Lineman',
    isStarPlayer: false,
    externalIds: tpId('stand-in-position'),
  });
  const line = (agility: number) => ({
    positionId: position.id,
    rulesSetId: rulesSet.id,
    move: 6,
    strength: 3,
    agility,
    passing: rulesSet.passingFormat === 'absent' ? null : 4,
    armour: 9,
  });
  const startingSkill = (attributeValue: string) => ({
    positionId: position.id,
    rulesSetId: rulesSet.id,
    skillId: skillRow.skillId,
    attributeValue,
  });
  // BBL: insert-only.
  await client.positionRulesSets.sync({ entries: [line(4)], insertOnly: true });
  await client.positionRulesSetSkills.sync({
    entries: [startingSkill('bbl')],
    insertOnly: true,
  });
  // TP: overwrites.
  await client.positionRulesSets.sync({ entries: [line(3)] });
  await client.positionRulesSetSkills.sync({ entries: [startingSkill('tp')] });
  return position.id;
}

/**
 * The BBL and TP importers, reduced to the writes this suite pins: each
 * curated entity re-sent under a raw source spelling (no renameExisting),
 * a characteristics line and a starting skill written BBL-style
 * (insertOnly) then TP-style, and a TP player whose spp_total only the
 * reported-adjustments step writes. Same RPC procedures and payload shapes
 * as the real tools; none of their parsing or orchestration.
 */
export async function runSourceStandIn(
  client: ApiClient,
  db: Db,
): Promise<StandInOutcome> {
  const systems = await systemIds(db);
  const resent = await resendRawNames(client, systems);

  const tp = systems.get('tourplay.net');
  if (tp === undefined) {
    throw new Error('tourplay.net not imported');
  }
  const tpId = (externalId: string) => [{ externalSystemId: tp, externalId }];
  const positionId = await writeCharacteristics(client, db, tpId);

  // A TP player: the roster pass writes no spp_total; the adjustments step does.
  const [era] = await db
    .select({ id: eras.id })
    .from(eras)
    .orderBy(eras.id)
    .limit(1);
  const standInTeam = await client.teams.upsert({
    name: 'Stand-in Team',
    raceId: resent.raceId,
    coachId: resent.coachId,
    eras: [era.id],
    externalIds: tpId('stand-in-team'),
  });
  const teamEra = standInTeam.eras.find((row) => row.eraId === era.id);
  if (teamEra === undefined) {
    throw new Error('stand-in team era not created');
  }
  const player = await client.players.upsert({
    name: 'Stand-in Player',
    teamEraId: teamEra.id,
    positionId,
    externalIds: tpId('stand-in-player'),
  });
  await client.players.syncReportedSppAdjustments({
    players: [{ playerId: player.id, reportedSppTotal: 12 }],
  });

  const [characteristics] = await db
    .select({ id: positionRulesSets.id, agility: positionRulesSets.agility })
    .from(positionRulesSets)
    .where(eq(positionRulesSets.positionId, positionId));
  const [skillLink] = await db
    .select({ attributeValue: positionRulesSetSkills.attributeValue })
    .from(positionRulesSetSkills)
    .where(eq(positionRulesSetSkills.positionRulesSetId, characteristics.id));
  const [stored] = await db
    .select({ sppTotal: players.sppTotal })
    .from(players)
    .where(eq(players.id, player.id));
  return {
    namesAfterRawUpsert: resent.names,
    agility: characteristics.agility,
    attributeValue: skillLink.attributeValue,
    sppTotal: stored.sppTotal,
  };
}

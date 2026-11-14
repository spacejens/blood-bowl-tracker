import type {
  ImportError,
  PlayerSkillEntry,
  TpImportedPlayer,
} from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristicCounts } from '@blood-bowl-tracker/domain-enums';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpKeywordTargetDecoderService } from '../../official-teams/tp-keyword-target-decoder.service';
import { TpOfficialKeywordCatalogService } from '../../official-teams/tp-official-keyword-catalog.service';
import {
  rosterContext,
  rosterPlayer,
  TP_SYSTEM_ID,
  tpRoster,
} from '../tp-roster.test-helpers';
import { TpLiveAdvancementSyncService } from './tp-live-advancement-sync.service';
import type { SyncRosterPlayerSkillsOptions } from './tp-roster-player-skills.service';
import { TpRosterPlayerSkillsService } from './tp-roster-player-skills.service';
import { TpRosterSkillIdsService } from './tp-roster-skill-ids.service';

const CONTENT = { raw: 'roster' };
const INCREASES: PlayerCharacteristicCounts = {
  MA: 0,
  ST: 1,
  AG: 0,
  PA: 0,
  AV: 0,
};

describe('TpRosterPlayerSkillsService', () => {
  let service: TpRosterPlayerSkillsService;
  let skillIds: MockProxy<TpRosterSkillIdsService>;
  let keywordCatalog: MockProxy<TpOfficialKeywordCatalogService>;
  let liveSync: MockProxy<TpLiveAdvancementSyncService>;
  let errors: ImportError[];

  beforeEach(async () => {
    skillIds = mock<TpRosterSkillIdsService>();
    keywordCatalog = mock<TpOfficialKeywordCatalogService>();
    liveSync = mock<TpLiveAdvancementSyncService>();
    skillIds.resolve.mockResolvedValue(
      new Map([
        [41, { skillId: 500, name: 'Block' }],
        [60, { skillId: 501, name: 'Loner' }],
        [70, { skillId: 502, name: 'Dodge' }],
        [80, { skillId: 503, name: 'Guard' }],
        [307, { skillId: 504, name: 'Hatred' }],
      ]),
    );
    keywordCatalog.load.mockResolvedValue({
      byCode: new Map([[111, { keywordId: 5, name: 'Dwarf' }]]),
    });
    liveSync.syncPlayer.mockResolvedValue(true);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterPlayerSkillsService,
        { provide: TpRosterSkillIdsService, useValue: skillIds },
        { provide: TpOfficialKeywordCatalogService, useValue: keywordCatalog },
        { provide: TpLiveAdvancementSyncService, useValue: liveSync },
        // Pure, dependency-free decision logic and error/exception helpers,
        // passed real so tests assert on the actual decode and errors.
        TpKeywordTargetDecoderService,
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(TpRosterPlayerSkillsService);
  });

  /** Every given player imported, as player ids 700, 701, ... in order. */
  const importedAll = (players: TpRosterPlayer[]): TpImportedPlayer[] =>
    players.map((player, index) => ({
      lineUpId: player.id,
      playerId: 700 + index,
      created: true,
      reportedSppTotal: 0,
    }));

  const sync = (
    players: TpRosterPlayer[],
    importedPlayers: TpImportedPlayer[] = importedAll(players),
    options: {
      increasesByPlayerId?: ReadonlyMap<number, PlayerCharacteristicCounts>;
      confirmNewAdvancements?: boolean;
      journeymen?: SyncRosterPlayerSkillsOptions['journeymen'];
    } = {},
  ) =>
    service.syncPlayerSkills({
      roster: tpRoster({ players }),
      content: CONTENT,
      importedPlayers,
      increasesByPlayerId: options.increasesByPlayerId ?? new Map(),
      confirmNewAdvancements: options.confirmNewAdvancements,
      journeymen: options.journeymen,
      context: rosterContext(),
      errors,
    });

  /** The skill entries handed to the advancement sync, one list per player. */
  const handed = (): PlayerSkillEntry[][] =>
    liveSync.syncPlayer.mock.calls.map(([options]) => options.skillEntries);

  describe('journeymen', () => {
    /** A player who gained Loner (master 60), then Block (master 41). */
    const lonerThenBlock = () =>
      rosterPlayer({
        skills: {
          starting: [],
          gained: [
            { skillMasterId: 60, isRandom: false, isExtra: false },
            { skillMasterId: 41, isRandom: false, isExtra: false },
          ],
        },
      });

    it("leaves a journeyman's gained Loner out", async () => {
      await sync([lonerThenBlock()], undefined, {
        journeymen: {
          playerIds: new Set([700]),
          lonerMasterIds: new Set([60]),
        },
      });

      expect(handed()).toEqual([
        [
          {
            playerId: 700,
            skillId: 500,
            source: 'chosen',
            attributeValue: null,
            advancementOrder: 1,
          },
        ],
      ]);
    });

    it('keeps a gained Loner of a player who is not a journeyman', async () => {
      await sync([lonerThenBlock()], undefined, {
        journeymen: { playerIds: new Set(), lonerMasterIds: new Set([60]) },
      });

      expect(handed()[0]).toContainEqual(
        expect.objectContaining({ skillId: 501, advancementOrder: 1 }),
      );
    });
  });

  it('writes starting skills, then gained ones as chosen or random in advancement order', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [
          { skillMasterId: 41 },
          { skillMasterId: 60, attributeValue: '4+', attributeType: 1 },
        ],
        gained: [
          { skillMasterId: 70, isRandom: true, isExtra: false },
          { skillMasterId: 80, isRandom: false, isExtra: false },
        ],
      },
    });

    const written = await sync([player]);

    expect(written).toBe(4);
    expect(skillIds.resolve).toHaveBeenCalledWith({
      masterIds: new Set([41, 60, 70, 80]),
      content: CONTENT,
      rosterId: 163386,
      context: rosterContext(),
      errors,
    });
    expect(liveSync.syncPlayer).toHaveBeenCalledTimes(1);
    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 500,
          source: 'starting',
          attributeValue: null,
        },
        {
          playerId: 700,
          skillId: 501,
          source: 'starting',
          attributeValue: '4+',
        },
        {
          playerId: 700,
          skillId: 502,
          source: 'random',
          attributeValue: null,
          advancementOrder: 1,
        },
        {
          playerId: 700,
          skillId: 503,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 2,
        },
      ],
    ]);
    expect(keywordCatalog.load).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('writes each player separately', async () => {
    const first = rosterPlayer({
      skills: { starting: [{ skillMasterId: 41 }], gained: [] },
    });
    const second = rosterPlayer({
      id: 5002,
      skills: { starting: [{ skillMasterId: 70 }], gained: [] },
    });

    const written = await sync([first, second]);

    expect(written).toBe(2);
    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 500,
          source: 'starting',
          attributeValue: null,
        },
      ],
      [
        {
          playerId: 701,
          skillId: 502,
          source: 'starting',
          attributeValue: null,
        },
      ],
    ]);
  });

  it('skips resolution and writes nothing when no imported player carries a skills group', async () => {
    const noSkillsGroup = rosterPlayer();
    const notImported = rosterPlayer({
      id: 5002,
      skills: { starting: [{ skillMasterId: 41 }], gained: [] },
    });

    const written = await sync(
      [noSkillsGroup, notImported],
      [{ lineUpId: 5001, playerId: 700, created: true, reportedSppTotal: 0 }],
    );

    expect(written).toBe(0);
    expect(skillIds.resolve).not.toHaveBeenCalled();
    expect(liveSync.syncPlayer).not.toHaveBeenCalled();
  });

  it('leaves out a skill whose id did not resolve, adding no error of its own', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [{ skillMasterId: 41 }, { skillMasterId: 99 }],
        gained: [],
      },
    });

    const written = await sync([player]);

    expect(written).toBe(1);
    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 500,
          source: 'starting',
          attributeValue: null,
        },
      ],
    ]);
    expect(errors).toEqual([]);
  });

  it('writes nothing for a player none of whose skills resolved', async () => {
    const player = rosterPlayer({
      skills: { starting: [{ skillMasterId: 99 }], gained: [] },
    });

    const written = await sync([player]);

    expect(written).toBe(0);
    expect(liveSync.syncPlayer).not.toHaveBeenCalled();
  });

  it('decodes a Hatred keyword code through the curated catalogue', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [],
        gained: [
          {
            skillMasterId: 307,
            attributeValue: '111',
            attributeType: 3,
            isRandom: false,
            isExtra: false,
          },
        ],
      },
    });

    await sync([player]);

    expect(keywordCatalog.load).toHaveBeenCalledWith({
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });
    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 504,
          source: 'chosen',
          attributeValue: 'Dwarf',
          advancementOrder: 1,
        },
      ],
    ]);
  });

  it('leaves out a skill with an uncurated keyword code, reporting it once across players', async () => {
    const hatred999 = {
      skillMasterId: 307,
      attributeValue: '999',
      attributeType: 3,
    };
    const first = rosterPlayer({
      skills: { starting: [hatred999, { skillMasterId: 41 }], gained: [] },
    });
    const second = rosterPlayer({
      id: 5002,
      skills: { starting: [hatred999], gained: [] },
    });

    const written = await sync([first, second]);

    expect(written).toBe(1);
    expect(liveSync.syncPlayer).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([
      {
        item: { skillMasterId: 307, attributeValue: '999' },
        message:
          'TP skill 307 (Hatred) names keyword code "999" as its target, and no curated keyword carries that code, so it is left out of that player\'s skills. Curate it in tools/import-manual (keywords.json5 in a new batch under data/batches/).',
      },
    ]);
  });

  it('keeps the gained entry when a skill is both starting and gained', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [{ skillMasterId: 41 }],
        gained: [{ skillMasterId: 41, isRandom: false, isExtra: false }],
      },
    });

    const written = await sync([player]);

    expect(written).toBe(1);
    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 500,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 1,
        },
      ],
    ]);
  });

  it('keeps the earlier of two gained entries for one skill', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [],
        gained: [
          { skillMasterId: 41, isRandom: false, isExtra: false },
          { skillMasterId: 41, isRandom: true, isExtra: false },
        ],
      },
    });

    await sync([player]);

    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 500,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 1,
        },
      ],
    ]);
  });

  it('sends a gained skill TP flags as extra as a free extra', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [],
        gained: [
          {
            skillMasterId: 307,
            attributeValue: '111',
            attributeType: 3,
            isRandom: false,
            isExtra: true,
          },
          { skillMasterId: 70, isRandom: true, isExtra: false },
        ],
      },
    });

    await sync([player]);

    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 504,
          source: 'chosen',
          attributeValue: 'Dwarf',
          advancementOrder: 1,
          isFreeExtra: true,
        },
        {
          playerId: 700,
          skillId: 502,
          source: 'random',
          attributeValue: null,
          advancementOrder: 2,
        },
      ],
    ]);
  });

  it('keeps the earlier of two gained entries free when the later one is flagged extra', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [{ skillMasterId: 41 }],
        gained: [
          { skillMasterId: 41, isRandom: false, isExtra: false },
          { skillMasterId: 41, isRandom: true, isExtra: true },
        ],
      },
    });

    await sync([player]);

    expect(handed()).toEqual([
      [
        {
          playerId: 700,
          skillId: 500,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 1,
          isFreeExtra: true,
        },
      ],
    ]);
  });

  it('keeps one of two identical starting entries', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [{ skillMasterId: 41 }, { skillMasterId: 41 }],
        gained: [],
      },
    });

    const written = await sync([player]);

    expect(written).toBe(1);
  });

  it('counts a player the sync could not write as unwritten and still syncs the next', async () => {
    liveSync.syncPlayer.mockResolvedValueOnce(false);
    const first = rosterPlayer({
      skills: { starting: [{ skillMasterId: 41 }], gained: [] },
    });
    const second = rosterPlayer({
      id: 5002,
      name: 'Snag',
      skills: { starting: [{ skillMasterId: 70 }], gained: [] },
    });

    const written = await sync([first, second]);

    expect(written).toBe(1);
    expect(liveSync.syncPlayer).toHaveBeenCalledTimes(2);
  });
  describe("in TP's skill row-id order", () => {
    /** A gained, paid skill with the given row id. */
    const paid = (skillMasterId: number, rowId?: number) => ({
      skillMasterId,
      isRandom: false,
      isExtra: false,
      ...(rowId === undefined ? {} : { rowId }),
    });
    /** The gained entry handed on for one skill at one number. */
    const handedGained = (
      skillId: number,
      advancementOrder: number,
    ): PlayerSkillEntry => ({
      playerId: 700,
      skillId,
      source: 'chosen',
      attributeValue: null,
      advancementOrder,
    });

    it('numbers the gained skills in row-id order and says the order is known', async () => {
      const player = rosterPlayer({
        skills: {
          starting: [],
          gained: [paid(70, 1812869), paid(80, 1597390), paid(41, 1597388)],
        },
      });

      await sync([player]);

      expect(handed()).toEqual([
        [handedGained(500, 1), handedGained(503, 2), handedGained(502, 3)],
      ]);
      expect(liveSync.syncPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ gainedOrderKnown: true }),
      );
    });

    it.each([
      ['one gained skill has no row id', [paid(70, 300), paid(80)]],
      ['two gained skills share a row id', [paid(70, 300), paid(80, 300)]],
      ['only one gained skill is listed', [paid(70, 300)]],
    ])('keeps the list order when %s', async (_label, gained) => {
      await sync([rosterPlayer({ skills: { starting: [], gained } })]);

      expect(handed()[0]).toEqual(
        gained.map((ref, at) =>
          handedGained(ref.skillMasterId === 70 ? 502 : 503, at + 1),
        ),
      );
      expect(liveSync.syncPlayer.mock.calls[0][0]).not.toHaveProperty(
        'gainedOrderKnown',
      );
    });

    it('places a free extra by its own row id, outside the paid order', async () => {
      const player = rosterPlayer({
        skills: {
          starting: [],
          gained: [
            paid(70, 300),
            { ...paid(307, 100), isExtra: true },
            paid(80, 200),
          ],
        },
      });

      await sync([player]);

      expect(handed()).toEqual([
        [
          { ...handedGained(504, 1), isFreeExtra: true },
          handedGained(503, 2),
          handedGained(502, 3),
        ],
      ]);
    });

    it('keeps a gained copy of a starting skill in its place in the order', async () => {
      const player = rosterPlayer({
        skills: {
          starting: [{ skillMasterId: 41 }],
          gained: [paid(41, 200), paid(70, 100)],
        },
      });

      await sync([player]);

      expect(handed()).toEqual([[handedGained(502, 1), handedGained(500, 2)]]);
    });
  });

  describe('characteristic increases', () => {
    const withSkill = rosterPlayer({
      skills: { starting: [{ skillMasterId: 41 }], gained: [] },
    });
    const BLOCK: PlayerSkillEntry = {
      playerId: 700,
      skillId: 500,
      source: 'starting',
      attributeValue: null,
    };
    const imported = (snapshot: {
      unspentSpp: number;
      snapshotSppTotal: number;
    }): TpImportedPlayer[] => [
      {
        lineUpId: 5001,
        playerId: 700,
        created: false,
        reportedSppTotal: 35,
        unspentSppSnapshot: snapshot,
      },
    ];

    it("hands each player to the advancement sync as the bulk import, with TP's unspent figure", async () => {
      const snapshot = { unspentSpp: 4, snapshotSppTotal: 35 };

      const written = await sync([withSkill], imported(snapshot), {
        increasesByPlayerId: new Map([[700, INCREASES]]),
      });

      expect(written).toBe(1);
      expect(liveSync.syncPlayer).toHaveBeenCalledWith({
        player: { id: 5001, name: 'Grim' },
        playerId: 700,
        skillEntries: [BLOCK],
        increases: INCREASES,
        snapshot,
        bulk: true,
        errors,
      });
    });

    it('states no increases for a player whose increases are unknown', async () => {
      await sync([withSkill]);

      expect(liveSync.syncPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          skillEntries: [BLOCK],
          increases: undefined,
        }),
      );
    });

    it('syncs a player with increases but no skills group', async () => {
      const written = await sync([rosterPlayer()], undefined, {
        increasesByPlayerId: new Map([[700, INCREASES]]),
      });

      expect(written).toBe(0);
      expect(skillIds.resolve).not.toHaveBeenCalled();
      expect(liveSync.syncPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ skillEntries: [], increases: INCREASES }),
      );
    });

    it('skips a player with neither skills nor increases', async () => {
      const noneResolved = rosterPlayer({
        skills: { starting: [{ skillMasterId: 999 }], gained: [] },
      });

      await sync([noneResolved]);

      expect(liveSync.syncPlayer).not.toHaveBeenCalled();
    });

    it('hands each player to the live sync without the bulk flag in the live import', async () => {
      const snapshot = { unspentSpp: 4, snapshotSppTotal: 35 };

      const written = await sync([withSkill], imported(snapshot), {
        increasesByPlayerId: new Map([[700, INCREASES]]),
        confirmNewAdvancements: true,
      });

      expect(written).toBe(1);
      expect(liveSync.syncPlayer).toHaveBeenCalledWith({
        player: { id: 5001, name: 'Grim' },
        playerId: 700,
        skillEntries: [BLOCK],
        increases: INCREASES,
        snapshot,
        errors,
      });
    });

    it('counts nothing as written when the sync wrote nothing', async () => {
      liveSync.syncPlayer.mockResolvedValue(false);

      const written = await sync([withSkill], undefined, {
        confirmNewAdvancements: true,
      });

      expect(written).toBe(0);
      expect(liveSync.syncPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ increases: undefined, snapshot: undefined }),
      );
    });
  });
});

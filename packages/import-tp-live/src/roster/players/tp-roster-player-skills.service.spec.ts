import type {
  ImportError,
  TpImportedPlayer,
} from '@blood-bowl-tracker/api-contract';
import { PlayerSkillsService } from '@blood-bowl-tracker/game-data';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpKeywordTargetDecoderService } from '../../official-teams/tp-keyword-target-decoder.service';
import { TpOfficialKeywordCatalogService } from '../../official-teams/tp-official-keyword-catalog.service';
import { TpImportResultsService } from '../../tp-import-results.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import {
  rosterContext,
  rosterPlayer,
  TP_SYSTEM_ID,
  tpRoster,
} from '../tp-roster.test-helpers';
import { TpRosterPlayerSkillsService } from './tp-roster-player-skills.service';
import { TpRosterSkillIdsService } from './tp-roster-skill-ids.service';

const CONTENT = { raw: 'roster' };

describe('TpRosterPlayerSkillsService', () => {
  let service: TpRosterPlayerSkillsService;
  let skillIds: MockProxy<TpRosterSkillIdsService>;
  let keywordCatalog: MockProxy<TpOfficialKeywordCatalogService>;
  let playerSkills: MockProxy<PlayerSkillsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    skillIds = mock<TpRosterSkillIdsService>();
    keywordCatalog = mock<TpOfficialKeywordCatalogService>();
    playerSkills = mock<PlayerSkillsService>();
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
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [] });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterPlayerSkillsService,
        { provide: TpRosterSkillIdsService, useValue: skillIds },
        { provide: TpOfficialKeywordCatalogService, useValue: keywordCatalog },
        { provide: PlayerSkillsService, useValue: playerSkills },
        // Pure, dependency-free decision logic and error/exception helpers,
        // passed real so tests assert on the actual decode and errors.
        TpKeywordTargetDecoderService,
        TpImportResultsService,
        TpUpsertRunnerService,
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
    }));

  const sync = (
    players: TpRosterPlayer[],
    importedPlayers: TpImportedPlayer[] = importedAll(players),
  ) =>
    service.syncPlayerSkills({
      roster: tpRoster({ players }),
      content: CONTENT,
      importedPlayers,
      context: rosterContext(),
      errors,
    });

  it('writes starting skills, then gained ones as chosen or random in advancement order', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [
          { skillMasterId: 41 },
          { skillMasterId: 60, attributeValue: '4+', attributeType: 1 },
        ],
        gained: [
          { skillMasterId: 70, isRandom: true },
          { skillMasterId: 80, isRandom: false },
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
    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: [
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
    });
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
    expect(playerSkills.sync).toHaveBeenNthCalledWith(1, {
      entries: [
        {
          playerId: 700,
          skillId: 500,
          source: 'starting',
          attributeValue: null,
        },
      ],
    });
    expect(playerSkills.sync).toHaveBeenNthCalledWith(2, {
      entries: [
        {
          playerId: 701,
          skillId: 502,
          source: 'starting',
          attributeValue: null,
        },
      ],
    });
  });

  it('skips resolution and writes nothing when no imported player carries a skills group', async () => {
    const noSkillsGroup = rosterPlayer();
    const notImported = rosterPlayer({
      id: 5002,
      skills: { starting: [{ skillMasterId: 41 }], gained: [] },
    });

    const written = await sync(
      [noSkillsGroup, notImported],
      [{ lineUpId: 5001, playerId: 700, created: true }],
    );

    expect(written).toBe(0);
    expect(skillIds.resolve).not.toHaveBeenCalled();
    expect(playerSkills.sync).not.toHaveBeenCalled();
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
    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        {
          playerId: 700,
          skillId: 500,
          source: 'starting',
          attributeValue: null,
        },
      ],
    });
    expect(errors).toEqual([]);
  });

  it('writes nothing for a player none of whose skills resolved', async () => {
    const player = rosterPlayer({
      skills: { starting: [{ skillMasterId: 99 }], gained: [] },
    });

    const written = await sync([player]);

    expect(written).toBe(0);
    expect(playerSkills.sync).not.toHaveBeenCalled();
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
          },
        ],
      },
    });

    await sync([player]);

    expect(keywordCatalog.load).toHaveBeenCalledWith({
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });
    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        {
          playerId: 700,
          skillId: 504,
          source: 'chosen',
          attributeValue: 'Dwarf',
          advancementOrder: 1,
        },
      ],
    });
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
    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([
      {
        item: { skillMasterId: 307, attributeValue: '999' },
        message:
          'TP skill 307 (Hatred) names keyword code "999" as its target, and no curated keyword carries that code, so it is left out of that player\'s skills. Curate it in tools/import-manual (data/before-other-importers/keywords.json5).',
      },
    ]);
  });

  it('keeps the gained entry when a skill is both starting and gained', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [{ skillMasterId: 41 }],
        gained: [{ skillMasterId: 41, isRandom: false }],
      },
    });

    const written = await sync([player]);

    expect(written).toBe(1);
    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        {
          playerId: 700,
          skillId: 500,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 1,
        },
      ],
    });
  });

  it('keeps the earlier of two gained entries for one skill', async () => {
    const player = rosterPlayer({
      skills: {
        starting: [],
        gained: [
          { skillMasterId: 41, isRandom: false },
          { skillMasterId: 41, isRandom: true },
        ],
      },
    });

    await sync([player]);

    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        {
          playerId: 700,
          skillId: 500,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 1,
        },
      ],
    });
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

  it("reports a failed write as one error naming the player and still writes the other players' skills", async () => {
    playerSkills.sync.mockRejectedValueOnce(new Error('db down'));
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
    expect(playerSkills.sync).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([
      {
        item: { lineUpId: 5001, playerId: 700 },
        message: 'Failed to write 1 skill(s) of player "Grim" (5001): db down',
      },
    ]);
  });
});

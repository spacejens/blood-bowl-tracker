import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it } from 'vitest';

import { type EraConfig } from '../eras/era-config.service';
import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  defaultEras as eras,
  eraIdsByName,
  goodPlayer,
  importOptions,
  makeRulesSet,
  makeService,
  plPage,
  resultArgs,
} from './bbl-players-import.test-helpers';

/** An era whose rules sets change mid-era, oldest first. */
const spanningEras: EraConfig[] = [
  {
    identity: { name: 'LRB', rulesSets: ['CRP', 'CRP+', 'BB2016'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: {
      firstPlayerId: 1,
      lastPlayerId: 9999,
      autoAssignByPlayerId: true,
    },
  },
];

describe('BblPlayersImportService characteristics', () => {
  it('sends the parsed characteristics with the era rules set id when the rules set has Passing', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      eras,
    );

    await service.importPlayers(importOptions);

    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        move: 5,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
        rulesSetId: 800,
      }),
      expect.any(Array),
    );
  });

  it('sends passing null when the era rules set declares no Passing characteristic', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      eras,
    );

    await service.importPlayers({
      ...importOptions,
      rulesSetsByName: new Map<string, RulesSet>([
        ['LRB', makeRulesSet({ name: 'LRB', passingFormat: 'absent' })],
      ]),
    });

    // The page's own Passing value (4) is discarded: BBL's BB2020 migration
    // wrote a Passing value onto most players, including players whose era
    // has no such characteristic at all.
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ passing: null, rulesSetId: 800 }),
      expect.any(Array),
    );
  });

  it('sends passing 0 when the page shows a dash under a rules set that has Passing', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [
          plPage({
            ...goodPlayer,
            characteristics: {
              ...goodPlayer.characteristics,
              passing: null,
            },
          }),
        ],
      }),
      eras,
    );

    await service.importPlayers(importOptions);

    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ passing: 0 }),
      expect.any(Array),
    );
  });

  it('validates against the last rules set of an era that spans several', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      spanningEras,
    );

    await service.importPlayers({
      ...importOptions,
      rulesSetsByName: new Map<string, RulesSet>([
        [
          'CRP',
          makeRulesSet({ name: 'CRP', passingFormat: 'absent', id: 801 }),
        ],
        [
          'CRP+',
          makeRulesSet({ name: 'CRP+', passingFormat: 'absent', id: 802 }),
        ],
        [
          'BB2016',
          makeRulesSet({ name: 'BB2016', passingFormat: 'absent', id: 803 }),
        ],
      ]),
    });

    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSetId: 803, passing: null }),
      expect.any(Array),
    );
  });

  it('records an error and skips the player when the era rules set was not imported', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      eras,
    );

    const { playerIdsByPid } = await service.importPlayers({
      ...importOptions,
      rulesSetsByName: new Map<string, RulesSet>(),
    });

    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
    expect(playerIdsByPid.size).toBe(0);
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([
      {
        item: { pid: '42', era: 'LRB', rulesSet: 'LRB' },
        message:
          'Skipped player "Griff Oberwald" (42): rules set "LRB" for era "LRB" not imported',
      },
    ]);
  });

  it('records a parse error naming the characteristics line when the page will not parse', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(null, '77')] }),
      eras,
    );

    await service.importPlayers(importOptions);

    expect(mocks.playersImport.upsertPlayerResult).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toEqual([
      {
        item: { pid: '77' },
        message:
          'Failed to parse player page for pid "77": missing pid, <h1>, position link, team link, or characteristics line.',
      },
    ]);
  });

  it('still resolves eras through the lookup when characteristics are sent', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      eras,
      eraIdsByName,
    );

    await service.importPlayers(importOptions);

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: 1, externalId: 'LRB' },
    ]);
  });

  it('converts Agility and Armour into a bare-notation rules set', async () => {
    // goodPlayer's own Agility (3) is this scale's fixed point (6 - 3 = 3),
    // so converting it wouldn't distinguish this test from the pass-through
    // test below — a regression that dropped the convertAgility call
    // entirely would still pass. Override to AG 4 (converts to 2) so a
    // wrong or missing conversion is actually caught here.
    const bareAgilityPlayer = {
      ...goodPlayer,
      characteristics: { ...goodPlayer.characteristics, agility: 4 },
    };
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(bareAgilityPlayer)] }),
      eras,
    );

    await service.importPlayers({
      ...importOptions,
      rulesSetsByName: new Map<string, RulesSet>([
        [
          'LRB',
          makeRulesSet({
            name: 'LRB',
            passingFormat: 'absent',
            agilityFormat: 'bare',
            armourFormat: 'bare',
          }),
        ],
      ]),
    });

    // The page shows AG 4 / AV 8 in BBL's BB2020 notation. Under a rules set
    // that writes bare numbers those are AG 2 and AV 7.
    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ agility: 2, armour: 7 }),
      expect.any(Array),
    );
  });

  it('leaves Agility and Armour alone for a plus-notation rules set', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
      eras,
    );

    await service.importPlayers(importOptions);

    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ agility: 3, armour: 8 }),
      expect.any(Array),
    );
  });
});

import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { Skill } from '@blood-bowl-tracker/db';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpNameExternalIdService } from '../../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import {
  NAME_SYSTEM_ID,
  rosterContext,
  TP_SYSTEM_ID,
} from '../tp-roster.test-helpers';
import { TpRosterSkillIdsService } from './tp-roster-skill-ids.service';

const CONTENT = { raw: 'roster' };

describe('TpRosterSkillIdsService', () => {
  let service: TpRosterSkillIdsService;
  let names: MockProxy<SkillMasterNamesParserService>;
  let skills: MockProxy<SkillsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    names = mock<SkillMasterNamesParserService>();
    skills = mock<SkillsService>();
    names.extract.mockReturnValue(new Map());
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterSkillIdsService,
        { provide: SkillMasterNamesParserService, useValue: names },
        { provide: SkillsService, useValue: skills },
        // Constructor-free identity formatting and pure error/exception
        // helpers, passed real so tests assert on the actual ids and errors.
        TpNameExternalIdService,
        TpImportResultsService,
        TpUpsertRunnerService,
      ],
    }).compile();
    service = moduleRef.get(TpRosterSkillIdsService);
  });

  const resolve = (masterIds: number[]) =>
    service.resolve({
      masterIds: new Set(masterIds),
      content: CONTENT,
      rosterId: 163386,
      context: rosterContext(),
      errors,
    });

  it('resolves nothing, and scans nothing, when no skill is referenced', async () => {
    await expect(resolve([])).resolves.toEqual(new Map());

    expect(names.extract).not.toHaveBeenCalled();
    expect(skills.upsert).not.toHaveBeenCalled();
    expect(skills.resolveBatch).not.toHaveBeenCalled();
  });

  it('upserts a skill the roster names under its Name id and every TP id the roster gives that name', async () => {
    names.extract.mockReturnValue(
      new Map([
        [41, { name: 'Block', isElite: true }],
        [1041, { name: 'Block', isElite: true }],
        [60, { name: 'Loner', isElite: false }],
      ]),
    );
    skills.upsert.mockResolvedValue({
      skill: mock<Skill>({ id: 500 }),
      created: false,
    });

    const resolved = await resolve([41]);

    expect(resolved).toEqual(new Map([[41, { skillId: 500, name: 'Block' }]]));
    expect(names.extract).toHaveBeenCalledWith(CONTENT);
    expect(skills.upsert).toHaveBeenCalledTimes(1);
    expect(skills.upsert).toHaveBeenCalledWith({
      name: 'Block',
      externalIds: [
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Block' },
        { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
        { externalSystemId: TP_SYSTEM_ID, externalId: '1041' },
      ],
    });
    expect(skills.resolveBatch).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('upserts a name once when the roster references it by two ids', async () => {
    names.extract.mockReturnValue(
      new Map([
        [41, { name: 'Block', isElite: false }],
        [1041, { name: 'Block', isElite: false }],
      ]),
    );
    skills.upsert.mockResolvedValue({
      skill: mock<Skill>({ id: 500 }),
      created: true,
    });

    const resolved = await resolve([41, 1041]);

    expect(resolved).toEqual(
      new Map([
        [41, { skillId: 500, name: 'Block' }],
        [1041, { skillId: 500, name: 'Block' }],
      ]),
    );
    expect(skills.upsert).toHaveBeenCalledTimes(1);
  });

  it('resolves an id the roster does not name through a skill carrying it as a TP external id', async () => {
    skills.resolveBatch.mockResolvedValue([{ found: true, id: 610 }]);

    const resolved = await resolve([99]);

    expect(resolved).toEqual(
      new Map([[99, { skillId: 610, name: 'TP skill 99' }]]),
    );
    expect(skills.resolveBatch).toHaveBeenCalledWith([
      { externalSystemId: TP_SYSTEM_ID, externalId: '99' },
    ]);
    expect(skills.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('reports an id resolved neither way and leaves it out', async () => {
    skills.resolveBatch.mockResolvedValue([{ found: false }]);

    const resolved = await resolve([99]);

    expect(resolved).toEqual(new Map());
    expect(errors).toEqual([
      {
        item: { rosterId: 163386, skillMasterId: 99 },
        message:
          "Could not resolve TP skill 99 (roster 163386): the roster does not name it and no skill carries it as a TP external id, so it is left out of that player's skills. Import a roster or match that names it, or curate it in tools/import-manual (data/before-other-importers/skills.json5).",
      },
    ]);
  });

  it('reports a failed upsert once and does not retry it for another id of the same name', async () => {
    names.extract.mockReturnValue(
      new Map([
        [41, { name: 'Block', isElite: false }],
        [1041, { name: 'Block', isElite: false }],
      ]),
    );
    skills.upsert.mockRejectedValue(new Error('conflict'));

    const resolved = await resolve([41, 1041]);

    expect(resolved).toEqual(new Map());
    expect(skills.upsert).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([
      {
        item: { skill: 'Block' },
        message: 'Failed to upsert skill "Block": conflict',
      },
    ]);
  });

  it('reports a failed external-id lookup once, without an unresolved error per id', async () => {
    skills.resolveBatch.mockRejectedValue(new Error('db down'));

    const resolved = await resolve([98, 99]);

    expect(resolved).toEqual(new Map());
    expect(errors).toEqual([
      {
        item: { skillMasterIds: [98, 99] },
        message: 'Failed to resolve TP skill ids by external id: db down',
      },
    ]);
  });
});

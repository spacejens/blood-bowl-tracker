import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ImportResultService } from './import-result.service';
import { NameExternalIdService } from './name-external-id.service';
import { PositionRulesSetSkillsImportService } from './position-rules-set-skills-import.service';
import { SkillRulesSetsImportService } from './skill-rules-sets-import.service';
import { SkillsImportService } from './skills-import.service';
import { StartingSkillsImportService } from './starting-skills-import.service';
import type { ImportError } from './types';

describe('StartingSkillsImportService', () => {
  let service: StartingSkillsImportService;
  let skills: MockProxy<SkillsImportService>;
  let skillRulesSets: MockProxy<SkillRulesSetsImportService>;
  let positionSkills: MockProxy<PositionRulesSetSkillsImportService>;
  let bootstrap: MockProxy<ExternalSystemBootstrapService>;
  let importResults: MockProxy<ImportResultService>;
  let nameExternalId: MockProxy<NameExternalIdService>;

  beforeEach(async () => {
    skills = mock<SkillsImportService>();
    skillRulesSets = mock<SkillRulesSetsImportService>();
    positionSkills = mock<PositionRulesSetSkillsImportService>();
    bootstrap = mock<ExternalSystemBootstrapService>();
    importResults = mock<ImportResultService>();
    nameExternalId = mock<NameExternalIdService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1] });
    nameExternalId.forSkill.mockImplementation((name) => name);
    importResults.error.mockImplementation((error) => error);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StartingSkillsImportService,
        { provide: SkillsImportService, useValue: skills },
        { provide: SkillRulesSetsImportService, useValue: skillRulesSets },
        {
          provide: PositionRulesSetSkillsImportService,
          useValue: positionSkills,
        },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        { provide: ImportResultService, useValue: importResults },
        { provide: NameExternalIdService, useValue: nameExternalId },
      ],
    }).compile();
    service = moduleRef.get(StartingSkillsImportService);
  });

  // SkillsImportService.upsert resolves the entity flat, with `created`
  // alongside its own fields (not wrapped in a nested `entity` object) -- see
  // upsertProcedure in packages/api-contract/src/upsert-procedure.ts.
  function upserted(id: number, name: string) {
    return { id, name, createdAt: new Date(0), created: false };
  }

  it('upserts each skill once and syncs one batch per position/rules-set pair', async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'agility' },
      { rulesSetId: 9, category: 'agility' },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([
        [
          3,
          new Map([
            [4, ['Dodge']],
            [9, ['Dodge']],
          ]),
        ],
      ]),
      new Map([
        [4, 'CRP'],
        [9, 'BB2020'],
      ]),
      errors,
    );

    expect(synced).toBe(2);
    // One upsert for the whole run, not one per rules set.
    expect(skills.upsert).toHaveBeenCalledTimes(1);
    expect(skills.upsert).toHaveBeenCalledWith(
      {
        name: 'Dodge',
        externalIds: [{ externalSystemId: 1, externalId: 'Dodge' }],
      },
      errors,
    );
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledTimes(2);
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledWith(
      { entries: [{ positionId: 3, rulesSetId: 4, skillId: 5 }] },
      errors,
    );
  });

  it('skips a skill with no curated category for that rules set and records an error', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 9, category: 'agility' },
    ]);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, ['Dodge']]])]]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
    expect(positionSkills.syncPositionRulesSetSkills).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Dodge');
    expect(errors[0].message).toContain('"CRP"');
    expect(errors[0].message).toContain('tools/import-manual');
  });

  it('names an unmapped rules set by its bare id rather than throwing', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([]);
    const errors: ImportError[] = [];

    await service.syncStartingSkills(
      new Map([[3, new Map([[4, ['Dodge']]])]]),
      new Map(),
      errors,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('id 4');
  });

  it('records the missing-category error once per (skill, rules set), not once per position', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([]);
    const errors: ImportError[] = [];

    await service.syncStartingSkills(
      new Map([
        [3, new Map([[4, ['Dodge']]])],
        [7, new Map([[4, ['Dodge']]])],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(errors).toHaveLength(1);
  });

  it('skips a skill whose upsert failed without adding a second error', async () => {
    skills.upsert.mockResolvedValue(undefined);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, ['Dodge']]])]]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
    expect(skillRulesSets.listSkillRulesSets).not.toHaveBeenCalled();
    expect(errors).toHaveLength(0);
  });

  it('counts nothing for a rejected sync batch', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'agility' },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue(undefined);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, ['Dodge']]])]]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
  });

  it('records the bootstrap failure and syncs nothing when the Name system cannot be registered', async () => {
    const failure = { item: {}, message: 'no name system' };
    bootstrap.bootstrap.mockResolvedValue({ ok: false, error: failure });
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, ['Dodge']]])]]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
    expect(errors).toEqual([failure]);
    expect(skills.upsert).not.toHaveBeenCalled();
  });
});

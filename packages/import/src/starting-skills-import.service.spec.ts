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
    nameExternalId.forSkill.mockReturnValue('Dodge');
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
      { rulesSetId: 4, category: 'agility', isElite: false },
      { rulesSetId: 9, category: 'agility', isElite: false },
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
            [4, [{ name: 'Dodge', isElite: false }]],
            [9, [{ name: 'Dodge', isElite: false }]],
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
      {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            skillId: 5,
            attributeValue: undefined,
          },
        ],
      },
      errors,
    );
  });

  it('passes the attribute value through to the synced entry and dedupes on the resolved skill id', async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Loner'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'general', isElite: false },
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
            [
              4,
              [
                { name: 'Loner', attributeValue: '4+', isElite: false },
                { name: 'Loner', attributeValue: '4+', isElite: false },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(1);
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledTimes(1);
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledWith(
      {
        entries: [
          { positionId: 3, rulesSetId: 4, skillId: 5, attributeValue: '4+' },
        ],
      },
      errors,
    );
  });

  it('dedupes two different spellings that resolve to the same merged skill', async () => {
    // Both spellings' upserts resolve to the same skill id -- a curated
    // merge (e.g. "Claw" and "Claws") registers both as external ids of one
    // row, so BBL/TP's own upsert of either raw string matches that row.
    skills.upsert.mockResolvedValue(upserted(5, 'Claws'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'mutation', isElite: false },
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
            [
              4,
              [
                { name: 'Claw', isElite: false },
                { name: 'Claws', isElite: false },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    // Both raw spellings upsert to the same skill id -- the server would
    // reject the whole batch if both reached it as separate entries, since
    // it's the same (positionId, rulesSetId, skillId) pair twice.
    expect(synced).toBe(1);
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            skillId: 5,
            attributeValue: undefined,
          },
        ],
      },
      errors,
    );
  });

  it('keeps a defined attribute value when a duplicate ref for the same skill has none', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Loner'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'general', isElite: false },
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
            [
              4,
              [
                { name: 'Loner', isElite: false },
                { name: 'Loner', attributeValue: '4+', isElite: false },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(1);
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledWith(
      {
        entries: [
          { positionId: 3, rulesSetId: 4, skillId: 5, attributeValue: '4+' },
        ],
      },
      errors,
    );
  });

  it('drops a skill and records an error when duplicate refs disagree on its attribute value', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Loner'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'general', isElite: false },
    ]);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([
        [
          3,
          new Map([
            [
              4,
              [
                { name: 'Loner', attributeValue: '4+', isElite: false },
                { name: 'Loner', attributeValue: '6+', isElite: false },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
    expect(positionSkills.syncPositionRulesSetSkills).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Loner');
    expect(errors[0].message).toContain('4+');
    expect(errors[0].message).toContain('6+');
  });

  it('skips a skill with no curated category for that rules set and records an error', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 9, category: 'agility', isElite: false },
    ]);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])]]),
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
      new Map([[3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])]]),
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
        [3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])],
        [7, new Map([[4, [{ name: 'Dodge', isElite: false }]]])],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(errors).toHaveLength(1);
  });

  it('does not add a curation-gap error when the category read itself fails', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockImplementation(
      (_skillId, listErrors) => {
        // Mirrors SkillRulesSetsImportService.listSkillRulesSets recording its
        // own error on a failed read before returning undefined.
        listErrors.push({
          item: { skillRulesSets: 5 },
          message: 'Failed to list categories for skill 5: boom',
        });
        return Promise.resolve(undefined);
      },
    );
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])]]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
    expect(positionSkills.syncPositionRulesSetSkills).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(
      'Failed to list categories for skill 5: boom',
    );
  });

  it('caches a category-read failure so a second occurrence of the same skill neither re-reads nor re-reports', async () => {
    skills.upsert.mockResolvedValue(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockImplementation(
      (_skillId, listErrors) => {
        listErrors.push({
          item: { skillRulesSets: 5 },
          message: 'Failed to list categories for skill 5: boom',
        });
        return Promise.resolve(undefined);
      },
    );
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([
        [3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])],
        [7, new Map([[9, [{ name: 'Dodge', isElite: false }]]])],
      ]),
      new Map([
        [4, 'CRP'],
        [9, 'BB2020'],
      ]),
      errors,
    );

    expect(synced).toBe(0);
    expect(skillRulesSets.listSkillRulesSets).toHaveBeenCalledTimes(1);
    expect(positionSkills.syncPositionRulesSetSkills).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(
      'Failed to list categories for skill 5: boom',
    );
  });

  it('skips a skill whose upsert failed without adding a second error', async () => {
    skills.upsert.mockResolvedValue(undefined);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])]]),
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
      { rulesSetId: 4, category: 'agility', isElite: false },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue(undefined);
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])]]),
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
      new Map([[3, new Map([[4, [{ name: 'Dodge', isElite: false }]]])]]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(synced).toBe(0);
    expect(errors).toEqual([failure]);
    expect(skills.upsert).not.toHaveBeenCalled();
  });

  it('records the starting skill when the curated and source elite flags agree', async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Block'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 9, category: 'general', isElite: true },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[9, [{ name: 'Block', isElite: true }]]])]]),
      new Map([[9, 'BB2025']]),
      errors,
    );

    expect(synced).toBe(1);
    expect(errors).toEqual([]);
  });

  it('reports a source skill marked elite that is curated as not elite', async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Block'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 9, category: 'general', isElite: false },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    const synced = await service.syncStartingSkills(
      new Map([[3, new Map([[9, [{ name: 'Block', isElite: true }]]])]]),
      new Map([[9, 'BB2025']]),
      errors,
    );

    // Still recorded: only the curated flag disagrees, the skill itself is
    // genuinely a starting skill there.
    expect(synced).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ item: { skill: 'Block', rulesSet: 9 } });
    expect(errors[0].message).toContain('"Block"');
    expect(errors[0].message).toContain('"BB2025"');
    expect(errors[0].message).toContain('skills.json5');
  });

  it('reports a source skill not marked elite that is curated as elite', async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Block'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 9, category: 'general', isElite: true },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    await service.syncStartingSkills(
      new Map([[3, new Map([[9, [{ name: 'Block', isElite: false }]]])]]),
      new Map([[9, 'BB2025']]),
      errors,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('"Block"');
  });

  it('reports an elite mismatch once per skill and rules set, not once per position', async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Block'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 9, category: 'general', isElite: false },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    await service.syncStartingSkills(
      new Map([
        [3, new Map([[9, [{ name: 'Block', isElite: true }]]])],
        [4, new Map([[9, [{ name: 'Block', isElite: true }]]])],
      ]),
      new Map([[9, 'BB2025']]),
      errors,
    );

    expect(errors).toHaveLength(1);
  });

  it('uses a ref-supplied skillId directly instead of upserting the skill by name', async () => {
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'trait', isElite: false },
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
            [4, [{ name: 'TP skill 181', isElite: false, skillId: 42 }]],
          ]),
        ],
      ]),
      new Map([[4, 'BB2020']]),
      errors,
    );

    expect(synced).toBe(1);
    // The whole point of skillId: the upsert-by-name step is skipped.
    expect(skills.upsert).not.toHaveBeenCalled();
    // Every downstream check still runs, keyed by the resolved skill id.
    expect(skillRulesSets.listSkillRulesSets).toHaveBeenCalledWith(42, errors);
    expect(positionSkills.syncPositionRulesSetSkills).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            skillId: 42,
            attributeValue: undefined,
          },
        ],
      },
      errors,
    );
    expect(errors).toEqual([]);
  });

  it('still reports a curation gap and an elite mismatch for a ref-supplied skillId', async () => {
    skillRulesSets.listSkillRulesSets
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { rulesSetId: 9, category: 'trait', isElite: true },
      ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    await service.syncStartingSkills(
      new Map([
        [
          3,
          new Map([
            [4, [{ name: 'TP skill 181', isElite: false, skillId: 42 }]],
          ]),
        ],
        [
          5,
          new Map([
            [9, [{ name: 'TP skill 210', isElite: false, skillId: 43 }]],
          ]),
        ],
      ]),
      new Map([
        [4, 'BB2020'],
        [9, 'BB2025'],
      ]),
      errors,
    );

    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('has no curated category');
    expect(errors[0].message).toContain('TP skill 181');
    expect(errors[1].message).toContain('is curated as elite');
    expect(errors[1].message).toContain('TP skill 210');
  });

  it("merges a ref's extra external ids into the skill upsert alongside the Name id", async () => {
    skills.upsert.mockResolvedValueOnce(upserted(5, 'Dodge'));
    skillRulesSets.listSkillRulesSets.mockResolvedValue([
      { rulesSetId: 4, category: 'agility', isElite: false },
    ]);
    positionSkills.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });
    const errors: ImportError[] = [];

    await service.syncStartingSkills(
      new Map([
        [
          3,
          new Map([
            [
              4,
              [
                {
                  name: 'Dodge',
                  isElite: false,
                  externalIds: [
                    { externalSystemId: 7, externalId: '87' },
                    { externalSystemId: 7, externalId: '188' },
                  ],
                },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[4, 'CRP']]),
      errors,
    );

    expect(skills.upsert).toHaveBeenCalledWith(
      {
        name: 'Dodge',
        externalIds: [
          { externalSystemId: 1, externalId: 'Dodge' },
          { externalSystemId: 7, externalId: '87' },
          { externalSystemId: 7, externalId: '188' },
        ],
      },
      errors,
    );
  });
});

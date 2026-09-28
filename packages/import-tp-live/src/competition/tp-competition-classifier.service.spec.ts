import {
  CompetitionGroupsService,
  CompetitionsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpCompetitionClassifierService } from './tp-competition-classifier.service';
import type { NamePatternCandidate } from './tp-competition-group-matcher.service';
import { TpCompetitionGroupMatcherService } from './tp-competition-group-matcher.service';
import { TpCompetitionGroupPrecedentService } from './tp-competition-group-precedent.service';

const CHAOS_CUP: NamePatternCandidate = {
  id: 3,
  name: 'Chaos Cup',
  namePattern: '^Chaos Cup',
};
const SIBLINGS = [
  { id: 101, name: 'Chaos Cup 7', type: 'cup' as const },
  { id: 102, name: 'Chaos Cup 8', type: 'cup' as const },
];

describe('TpCompetitionClassifierService', () => {
  let service: TpCompetitionClassifierService;
  let groups: MockProxy<CompetitionGroupsService>;
  let competitions: MockProxy<CompetitionsService>;
  let matcher: MockProxy<TpCompetitionGroupMatcherService>;
  let precedent: MockProxy<TpCompetitionGroupPrecedentService>;

  beforeEach(async () => {
    groups = mock<CompetitionGroupsService>();
    competitions = mock<CompetitionsService>();
    matcher = mock<TpCompetitionGroupMatcherService>();
    precedent = mock<TpCompetitionGroupPrecedentService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionClassifierService,
        { provide: CompetitionGroupsService, useValue: groups },
        { provide: CompetitionsService, useValue: competitions },
        { provide: TpCompetitionGroupMatcherService, useValue: matcher },
        { provide: TpCompetitionGroupPrecedentService, useValue: precedent },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionClassifierService);
  });

  describe('classifyNew', () => {
    it("classifies a matched competition with its group's next name and shared type", async () => {
      groups.listWithNamePatterns.mockResolvedValue([CHAOS_CUP]);
      matcher.match.mockReturnValue({ kind: 'matched', group: CHAOS_CUP });
      competitions.listNamesAndTypesByGroup.mockResolvedValue(SIBLINGS);
      precedent.nextName.mockReturnValue('Chaos Cup 9');
      precedent.sharedType.mockReturnValue('cup');

      await expect(
        service.classifyNew('tLoEGBBL Chaos Cup 9'),
      ).resolves.toEqual({
        kind: 'classified',
        competitionGroupId: 3,
        name: 'Chaos Cup 9',
        type: 'cup',
      });
      expect(matcher.match).toHaveBeenCalledWith('tLoEGBBL Chaos Cup 9', [
        CHAOS_CUP,
      ]);
      expect(competitions.listNamesAndTypesByGroup).toHaveBeenCalledWith(3);
      expect(precedent.nextName).toHaveBeenCalledWith({
        groupName: 'Chaos Cup',
        rawName: 'tLoEGBBL Chaos Cup 9',
        existingNames: ['Chaos Cup 7', 'Chaos Cup 8'],
      });
      expect(precedent.sharedType).toHaveBeenCalledWith(['cup', 'cup']);
    });

    it('passes on an unmatched name without reading any competition', async () => {
      groups.listWithNamePatterns.mockResolvedValue([CHAOS_CUP]);
      matcher.match.mockReturnValue({ kind: 'unmatched' });

      await expect(service.classifyNew('Gamma Open')).resolves.toEqual({
        kind: 'unmatched',
      });
      expect(competitions.listNamesAndTypesByGroup).not.toHaveBeenCalled();
    });

    it('passes on an ambiguous match with the matching group names', async () => {
      groups.listWithNamePatterns.mockResolvedValue([CHAOS_CUP]);
      matcher.match.mockReturnValue({
        kind: 'ambiguous',
        groupNames: ['Chaos Cup', 'Other Cup'],
      });

      await expect(service.classifyNew('Chaos Cup 9')).resolves.toEqual({
        kind: 'ambiguous',
        groupNames: ['Chaos Cup', 'Other Cup'],
      });
      expect(competitions.listNamesAndTypesByGroup).not.toHaveBeenCalled();
    });
  });

  describe('sharedTypeOfCompetitionGroup', () => {
    it("returns the type shared across the competition's group", async () => {
      competitions.findGroupIdById.mockResolvedValue(3);
      competitions.listNamesAndTypesByGroup.mockResolvedValue(SIBLINGS);
      precedent.sharedType.mockReturnValue('cup');

      await expect(service.sharedTypeOfCompetitionGroup(12)).resolves.toBe(
        'cup',
      );
      expect(competitions.findGroupIdById).toHaveBeenCalledWith(12);
      expect(competitions.listNamesAndTypesByGroup).toHaveBeenCalledWith(3);
      expect(precedent.sharedType).toHaveBeenCalledWith(['cup', 'cup']);
    });

    it('returns undefined when the competition cannot be found', async () => {
      competitions.findGroupIdById.mockResolvedValue(undefined);

      await expect(
        service.sharedTypeOfCompetitionGroup(12),
      ).resolves.toBeUndefined();
      expect(competitions.listNamesAndTypesByGroup).not.toHaveBeenCalled();
    });

    it("excludes the competition's own row from the shared-type check", async () => {
      competitions.findGroupIdById.mockResolvedValue(3);
      competitions.listNamesAndTypesByGroup.mockResolvedValue([
        { id: 101, name: 'Chaos Cup 7', type: 'cup' },
        { id: 102, name: 'Chaos Cup 8', type: 'cup' },
        { id: 12, name: 'Chaos Cup 9', type: 'season' },
      ]);
      precedent.sharedType.mockReturnValue('cup');

      await expect(service.sharedTypeOfCompetitionGroup(12)).resolves.toBe(
        'cup',
      );
      expect(precedent.sharedType).toHaveBeenCalledWith(['cup', 'cup']);
    });

    it('returns undefined when the competition is the only member of its group', async () => {
      competitions.findGroupIdById.mockResolvedValue(3);
      competitions.listNamesAndTypesByGroup.mockResolvedValue([
        { id: 12, name: 'Chaos Cup 9', type: 'cup' },
      ]);
      precedent.sharedType.mockReturnValue(undefined);

      await expect(
        service.sharedTypeOfCompetitionGroup(12),
      ).resolves.toBeUndefined();
      expect(precedent.sharedType).toHaveBeenCalledWith([]);
    });
  });
});

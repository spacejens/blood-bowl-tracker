import type {
  UpsertCompetition,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UpsertFieldNarrowingService } from './upsert-field-narrowing.service';

const competition: UpsertCompetition = {
  name: 'BB2020',
  type: 'season',
  eraId: 500,
  teamEraIds: [],
  externalIds: [{ externalSystemId: 1, externalId: '1' }],
};

const team: UpsertTeam = {
  name: 'Knights',
  raceId: 70,
  coachId: 9,
  eras: [],
  externalIds: [],
};

describe('UpsertFieldNarrowingService', () => {
  let service: UpsertFieldNarrowingService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UpsertFieldNarrowingService],
    }).compile();
    service = moduleRef.get(UpsertFieldNarrowingService);
  });

  describe('resolveDefiniteEraId', () => {
    it('returns the eraId when defined', () => {
      expect(service.resolveDefiniteEraId(competition)).toBe(500);
    });

    it('throws when eraId is undefined', () => {
      expect(() =>
        service.resolveDefiniteEraId({ ...competition, eraId: undefined }),
      ).toThrow(
        'Competition "BB2020" has no eraId; import-bbl always resolves eraId before building its upsert.',
      );
    });
  });

  describe('resolveDefiniteRaceId', () => {
    it('returns the raceId when defined', () => {
      expect(service.resolveDefiniteRaceId(team)).toBe(70);
    });

    it('throws when raceId is undefined', () => {
      expect(() =>
        service.resolveDefiniteRaceId({ ...team, raceId: undefined }),
      ).toThrow(
        'Team "Knights" has no raceId; import-bbl always resolves raceId before building its upsert.',
      );
    });
  });
});

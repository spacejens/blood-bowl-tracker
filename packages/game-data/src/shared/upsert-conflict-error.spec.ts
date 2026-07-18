import { describe, expect, it } from 'vitest';

import {
  CoachUpsertConflictError,
  CompetitionUpsertConflictError,
  EraUpsertConflictError,
  LeagueUpsertConflictError,
  MatchEventUpsertConflictError,
  MatchUpsertConflictError,
  PlayerUpsertConflictError,
  PositionUpsertConflictError,
  RaceUpsertConflictError,
  RulesSetUpsertConflictError,
  TeamUpsertConflictError,
} from '../index';
import { UpsertConflictError } from './upsert-conflict-error';

const subclasses = [
  CoachUpsertConflictError,
  CompetitionUpsertConflictError,
  EraUpsertConflictError,
  LeagueUpsertConflictError,
  MatchEventUpsertConflictError,
  MatchUpsertConflictError,
  PlayerUpsertConflictError,
  PositionUpsertConflictError,
  RaceUpsertConflictError,
  RulesSetUpsertConflictError,
  TeamUpsertConflictError,
];

describe('UpsertConflictError', () => {
  it.each(subclasses)(
    'per-entity class %p extends UpsertConflictError and Error',
    (Cls) => {
      const err = new Cls('boom');
      expect(err).toBeInstanceOf(UpsertConflictError);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('boom');
    },
  );
});

import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { MatchParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpMatchEventsUpsertService } from './events/tp-match-events-upsert.service';
import {
  bracketMatch,
  COMPETITION_TP_ID,
  MATCH_DB_ID,
  matchContext,
  tpMatch,
} from './tp-match.test-helpers';
import { TpMatchContextService } from './tp-match-context.service';
import { TpMatchImportService } from './tp-match-import.service';
import { TpMatchOutcomeService } from './tp-match-outcome.service';
import { TpMatchUpsertService } from './tp-match-upsert.service';

const nothing = { success: true, imported: 0, errors: [] };
const failure = (message: string): ImportError => ({ item: 1, message });

describe('TpMatchImportService', () => {
  let service: TpMatchImportService;
  let parser: MockProxy<MatchParserService>;
  let context: MockProxy<TpMatchContextService>;
  let matchUpsert: MockProxy<TpMatchUpsertService>;
  let eventsUpsert: MockProxy<TpMatchEventsUpsertService>;
  let outcome: MockProxy<TpMatchOutcomeService>;

  beforeEach(async () => {
    parser = mock<MatchParserService>();
    context = mock<TpMatchContextService>();
    matchUpsert = mock<TpMatchUpsertService>();
    eventsUpsert = mock<TpMatchEventsUpsertService>();
    outcome = mock<TpMatchOutcomeService>();
    context.resolve.mockResolvedValue(matchContext());
    matchUpsert.upsertMatch.mockResolvedValue(MATCH_DB_ID);
    matchUpsert.syncParticipation.mockResolvedValue(true);
    eventsUpsert.upsertEvents.mockResolvedValue(14);
    outcome.resolveOutcome.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchImportService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: MatchParserService, useValue: parser },
        { provide: TpMatchContextService, useValue: context },
        { provide: TpMatchUpsertService, useValue: matchUpsert },
        { provide: TpMatchEventsUpsertService, useValue: eventsUpsert },
        { provide: TpMatchOutcomeService, useValue: outcome },
      ],
    }).compile();
    service = moduleRef.get(TpMatchImportService);
  });

  const bracket = [bracketMatch()];
  const importMatch = () =>
    service.importMatch({
      match: tpMatch(),
      bracket,
      competitionTpId: COMPETITION_TP_ID,
      externalSystemName: 'TP',
    });

  it('resolves the context, then imports the match, its participation, events and outcome', async () => {
    await expect(importMatch()).resolves.toEqual({
      match: { success: true, imported: 1, errors: [] },
      participation: { success: true, imported: 1, errors: [] },
      events: { success: true, imported: 14, errors: [] },
      outcome: { success: true, imported: 1, errors: [] },
    });
    expect(context.resolve).toHaveBeenCalledWith({
      match: tpMatch(),
      competitionTpId: COMPETITION_TP_ID,
      externalSystemName: 'TP',
      errors: [],
    });
    expect(matchUpsert.upsertMatch).toHaveBeenCalledWith({
      match: tpMatch(),
      bracket,
      context: matchContext(),
      errors: [],
    });
    expect(eventsUpsert.upsertEvents).toHaveBeenCalledWith({
      match: tpMatch(),
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors: [],
    });
    expect(outcome.resolveOutcome).toHaveBeenCalledWith({
      match: tpMatch(),
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors: [],
    });
  });

  it('imports nothing when the context cannot be resolved', async () => {
    context.resolve.mockImplementation(({ errors }) => {
      errors.push(failure('competition not imported'));
      return Promise.resolve(undefined);
    });

    const result = await importMatch();

    expect(result.match).toEqual({
      success: false,
      imported: 0,
      errors: [failure('competition not imported')],
    });
    expect(result.participation).toEqual(nothing);
    expect(result.events).toEqual(nothing);
    expect(result.outcome).toEqual(nothing);
    expect(matchUpsert.upsertMatch).not.toHaveBeenCalled();
  });

  it('stops after the match when it was not written', async () => {
    matchUpsert.upsertMatch.mockImplementation(({ errors }) => {
      errors.push(failure('unclassifiable'));
      return Promise.resolve(undefined);
    });

    const result = await importMatch();

    expect(result.match.success).toBe(false);
    expect(result.participation).toEqual(nothing);
    expect(matchUpsert.syncParticipation).not.toHaveBeenCalled();
  });

  it('skips events and outcome when participation failed', async () => {
    matchUpsert.syncParticipation.mockImplementation(({ errors }) => {
      errors.push(failure('link failed'));
      return Promise.resolve(false);
    });

    const result = await importMatch();

    expect(result.match.imported).toBe(1);
    expect(result.participation).toEqual({
      success: false,
      imported: 0,
      errors: [failure('link failed')],
    });
    expect(result.events).toEqual(nothing);
    expect(result.outcome).toEqual(nothing);
    expect(eventsUpsert.upsertEvents).not.toHaveBeenCalled();
    expect(outcome.resolveOutcome).not.toHaveBeenCalled();
  });

  it('reports an unresolved outcome without affecting the other stages', async () => {
    outcome.resolveOutcome.mockImplementation(({ errors }) => {
      errors.push(failure('undecidable'));
      return Promise.resolve(false);
    });

    const result = await importMatch();

    expect(result.events.imported).toBe(14);
    expect(result.outcome).toEqual({
      success: false,
      imported: 0,
      errors: [failure('undecidable')],
    });
  });

  describe('importRawMatch', () => {
    it('parses raw match JSON, then imports it', async () => {
      parser.parse.mockReturnValue(tpMatch());
      const content = { matchId: 1 };

      const result = await service.importRawMatch({
        content,
        bracket,
        competitionTpId: COMPETITION_TP_ID,
        externalSystemName: 'TP',
      });

      expect(parser.parse).toHaveBeenCalledWith(content);
      expect(result.match.imported).toBe(1);
    });

    it('reports a parse failure in the match result and imports nothing', async () => {
      parser.parse.mockImplementation(() => {
        throw new Error('matchId: Required');
      });

      const result = await service.importRawMatch({
        content: {},
        bracket,
        competitionTpId: COMPETITION_TP_ID,
        externalSystemName: 'TP',
      });

      expect(result.match).toEqual({
        success: false,
        imported: 0,
        errors: [
          {
            item: { competition: COMPETITION_TP_ID },
            message: 'Could not parse TP match: matchId: Required',
          },
        ],
      });
      expect(context.resolve).not.toHaveBeenCalled();
    });
  });
});

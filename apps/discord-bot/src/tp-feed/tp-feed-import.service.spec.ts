import { TpBlockedError } from '@blood-bowl-tracker/import-tp-live';
import type { TpPageClassification } from '@blood-bowl-tracker/tp-paths';
import { TpPageClassifierService } from '@blood-bowl-tracker/tp-paths';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { SleepService } from '../leader-election/sleep.service';
import { ClockService } from '../shared/clock.service';
import type { TpImportOutcome } from '../tp-import/tp-import-dispatch.service';
import { TpImportDispatchService } from '../tp-import/tp-import-dispatch.service';
import type { TpImportAssessment } from '../tp-import/tp-import-failure.service';
import { TpImportFailureService } from '../tp-import/tp-import-failure.service';
import { TpFeedBlockNoticeService } from './tp-feed-block-notice.service';
import type { TpFeedEvent } from './tp-feed-event';
import {
  TP_FEED_BLOCK_MARGIN_MS,
  TP_FEED_BLOCK_RETRIES,
  TP_FEED_IMPORT_DELAY_MS,
  TpFeedImportService,
} from './tp-feed-import.service';

const MINUTE = 60_000;
const NOW = new Date('2026-09-29T12:00:00.000Z');
const RETRY_AT = new Date(NOW.getTime() + 5 * MINUTE);
const blocked = () => new TpBlockedError(RETRY_AT);
const BASE = 'https://tourplay.net/en/blood-bowl/';
const MATCH_LINK = `${BASE}tloeg-blood-bowl-league-sasong-31/match/670570`;
const ROSTER_LINK = `${BASE}roster/167242`;
const MATCH_PAGE: TpPageClassification = {
  kind: 'match',
  tournamentSlug: 'tloeg-blood-bowl-league-sasong-31',
  matchId: 670570,
};
const ROSTER_PAGE: TpPageClassification = { kind: 'roster', rosterId: 167242 };
const TEAM = { name: 'A', race: 'Orc', coach: 'C' };
const MATCH_START: TpFeedEvent = {
  kind: 'match-start',
  home: TEAM,
  away: TEAM,
  link: MATCH_LINK,
};
const MATCH_END: TpFeedEvent = {
  kind: 'match-end',
  home: TEAM,
  away: TEAM,
  homeScore: 1,
  awayScore: 0,
  outcome: 'win',
  winnerName: 'A',
  link: MATCH_LINK,
};
const HIRED: TpFeedEvent = {
  kind: 'hired',
  playerNumber: '3',
  playerName: 'P',
  position: 'Lineman',
  teamName: 'A',
  link: ROSTER_LINK,
};
const FIRED: TpFeedEvent = { ...HIRED, kind: 'fired' };
const SKILL: TpFeedEvent = {
  kind: 'new-skill-or-characteristic',
  playerNumber: '3',
  playerName: 'P',
  position: 'Lineman',
  teamName: 'A',
  description: 'Block',
  link: ROSTER_LINK,
};
const TROPHY_LINK = `${BASE}tloegbbl-sasong-30/awards`;
const OTHER_TROPHY_LINK = `${BASE}tloegbbl-sasong-31/awards`;
const COMPETITION_PAGE: TpPageClassification = {
  kind: 'competition',
  tournamentSlug: 'tloegbbl-sasong-30',
};
const OTHER_COMPETITION_PAGE: TpPageClassification = {
  kind: 'competition',
  tournamentSlug: 'tloegbbl-sasong-31',
};
const TROPHY: TpFeedEvent = { kind: 'competition-trophy', link: TROPHY_LINK };
const OTHER_TROPHY: TpFeedEvent = {
  kind: 'competition-trophy',
  link: OTHER_TROPHY_LINK,
};
/** Canned classification per link. */
const PAGES: Record<string, TpPageClassification> = {
  [TROPHY_LINK]: COMPETITION_PAGE,
  [OTHER_TROPHY_LINK]: OTHER_COMPETITION_PAGE,
};
const OUTCOME = { kind: 'roster', rosterId: 167242 } as TpImportOutcome;
const assessment = (
  status: TpImportAssessment['status'],
): TpImportAssessment => ({
  subject: 'team 167242',
  status,
  notes: [],
  rows: [],
  errors:
    status === 'completed' ? [] : [{ label: 'Team', message: 'no coach' }],
});

/** A promise the test settles by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Lets every already-settled promise callback run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('TpFeedImportService', () => {
  let service: TpFeedImportService;
  let config: MockProxy<DiscordBotConfigService>;
  let classifier: MockProxy<TpPageClassifierService>;
  let dispatch: MockProxy<TpImportDispatchService>;
  let failure: MockProxy<TpImportFailureService>;
  let sleep: MockProxy<SleepService>;
  let clock: MockProxy<ClockService>;
  let blockNotice: MockProxy<TpFeedBlockNoticeService>;

  beforeEach(async () => {
    config = mock<DiscordBotConfigService>();
    config.getTpFrontendBaseUrl.mockReturnValue(BASE);
    classifier = mock<TpPageClassifierService>();
    classifier.classify.mockReturnValue(ROSTER_PAGE);
    dispatch = mock<TpImportDispatchService>();
    dispatch.dispatch.mockResolvedValue(OUTCOME);
    failure = mock<TpImportFailureService>();
    failure.assess.mockReturnValue(assessment('completed'));
    failure.isRealFailure.mockReturnValue(false);
    sleep = mock<SleepService>();
    sleep.sleep.mockResolvedValue(undefined);
    clock = mock<ClockService>();
    clock.now.mockReturnValue(NOW);
    blockNotice = mock<TpFeedBlockNoticeService>();
    blockNotice.announceBlocked.mockResolvedValue(undefined);
    blockNotice.announceResumed.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpFeedImportService,
        { provide: DiscordBotConfigService, useValue: config },
        { provide: TpPageClassifierService, useValue: classifier },
        { provide: TpImportDispatchService, useValue: dispatch },
        { provide: TpImportFailureService, useValue: failure },
        { provide: SleepService, useValue: sleep },
        { provide: ClockService, useValue: clock },
        { provide: TpFeedBlockNoticeService, useValue: blockNotice },
      ],
    }).compile();
    service = moduleRef.get(TpFeedImportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('what each notification imports', () => {
    it('imports the match of a match-end notification', async () => {
      classifier.classify.mockReturnValue(MATCH_PAGE);

      await expect(service.enqueue(MATCH_END)).resolves.toEqual({
        failed: false,
      });
      expect(classifier.classify).toHaveBeenCalledWith(MATCH_LINK, BASE);
      expect(dispatch.dispatch).toHaveBeenCalledWith({ page: MATCH_PAGE });
      expect(failure.assess).toHaveBeenCalledWith(OUTCOME);
    });

    it('imports only the teams of a match-start notification', async () => {
      classifier.classify.mockReturnValue(MATCH_PAGE);

      await service.enqueue(MATCH_START);

      expect(dispatch.dispatch).toHaveBeenCalledWith({
        page: {
          kind: 'matchTeams',
          tournamentSlug: 'tloeg-blood-bowl-league-sasong-31',
          matchId: 670570,
        },
      });
    });

    it.each([
      ['hired', HIRED],
      ['fired', FIRED],
      ['new skill or characteristic', SKILL],
    ])('imports the team of a %s notification', async (_name, event) => {
      await service.enqueue(event);

      expect(classifier.classify).toHaveBeenCalledWith(ROSTER_LINK, BASE);
      expect(dispatch.dispatch).toHaveBeenCalledWith({ page: ROSTER_PAGE });
    });

    it("imports a trophy announcement's whole competition, forcing its matches to be backfilled", async () => {
      classifier.classify.mockReturnValue(COMPETITION_PAGE);

      await expect(service.enqueue(TROPHY)).resolves.toEqual({ failed: false });
      expect(classifier.classify).toHaveBeenCalledWith(TROPHY_LINK, BASE);
      expect(dispatch.dispatch).toHaveBeenCalledWith({
        page: {
          kind: 'competitionScores',
          tournamentSlug: 'tloegbbl-sasong-30',
        },
      });
    });
  });

  describe('failures', () => {
    it('fails a trophy announcement whose link is not a competition page', async () => {
      classifier.classify.mockReturnValue(MATCH_PAGE);

      await expect(service.enqueue(TROPHY)).resolves.toEqual({
        failed: true,
        headline: 'TP import failed: the link is not a TP competition page',
        errors: [],
      });
      expect(dispatch.dispatch).not.toHaveBeenCalled();
    });

    let warn: MockInstance<Logger['warn']>;

    beforeEach(() => {
      warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    });

    it('fails a match notification whose link is not a match page, importing nothing', async () => {
      classifier.classify.mockReturnValue(ROSTER_PAGE);

      await expect(service.enqueue(MATCH_END)).resolves.toEqual({
        failed: true,
        headline: 'TP import failed: the link is not a TP match page',
        errors: [],
      });
      expect(dispatch.dispatch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it('fails a match-start notification whose link is not a match page', async () => {
      classifier.classify.mockReturnValue({ kind: 'unknown' });

      await expect(service.enqueue(MATCH_START)).resolves.toMatchObject({
        failed: true,
        headline: 'TP import failed: the link is not a TP match page',
      });
    });

    it('fails a team notification whose link is not a roster page', async () => {
      classifier.classify.mockReturnValue(MATCH_PAGE);

      await expect(service.enqueue(HIRED)).resolves.toMatchObject({
        failed: true,
        headline: 'TP import failed: the link is not a TP roster page',
      });
    });

    it('reports a failed import with its labelled errors, and logs it', async () => {
      failure.assess.mockReturnValue(assessment('failed'));
      failure.isRealFailure.mockReturnValue(true);

      await expect(service.enqueue(HIRED)).resolves.toEqual({
        failed: true,
        headline: 'TP import of team 167242 failed',
        errors: ['Team: no coach'],
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('TP import of team 167242 failed'),
      );
    });

    it('reports partial success as a failure', async () => {
      failure.assess.mockReturnValue(assessment('completedWithErrors'));
      failure.isRealFailure.mockReturnValue(true);

      await expect(service.enqueue(HIRED)).resolves.toEqual({
        failed: true,
        headline: 'TP import of team 167242 completed with errors',
        errors: ['Team: no coach'],
      });
    });

    it('turns an unexpected error into a failure instead of rejecting', async () => {
      dispatch.dispatch.mockRejectedValue(new Error('database down'));

      await expect(service.enqueue(HIRED)).resolves.toEqual({
        failed: true,
        headline: 'TP import failed unexpectedly',
        errors: ['database down'],
      });
    });

    it('reports a non-Error rejection as a string', async () => {
      dispatch.dispatch.mockRejectedValue('boom');

      await expect(service.enqueue(HIRED)).resolves.toMatchObject({
        errors: ['boom'],
      });
    });
  });

  describe('merging queued trophy announcements', () => {
    const BLOCKER: TpFeedEvent = { ...FIRED, link: `${BASE}roster/999` };

    beforeEach(() => {
      classifier.classify.mockImplementation(
        (url) => PAGES[url] ?? ROSTER_PAGE,
      );
    });

    it('skips a trophy announcement for a competition already queued, reporting the queued result', async () => {
      const first = deferred<TpImportOutcome>();
      dispatch.dispatch
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(OUTCOME);

      const blocker = service.enqueue(BLOCKER);
      const one = service.enqueue(TROPHY);
      const two = service.enqueue({ ...TROPHY });

      expect(two).toBe(one);
      first.resolve(OUTCOME);
      await Promise.all([blocker, one, two]);
      expect(dispatch.dispatch).toHaveBeenCalledTimes(2);
    });

    it('merges an announcement that arrives while the queued one is still waiting out its delay', async () => {
      const delay = deferred<void>();
      sleep.sleep.mockReturnValueOnce(delay.promise);

      const one = service.enqueue(TROPHY);
      await flush();
      const two = service.enqueue({ ...TROPHY });

      expect(two).toBe(one);
      delay.resolve();
      await one;
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
    });

    it('queues a fresh import for an announcement arriving after the queued one started importing', async () => {
      const running = deferred<TpImportOutcome>();
      dispatch.dispatch
        .mockReturnValueOnce(running.promise)
        .mockResolvedValue(OUTCOME);

      const one = service.enqueue(TROPHY);
      await flush();
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
      const two = service.enqueue({ ...TROPHY });

      expect(two).not.toBe(one);
      running.resolve(OUTCOME);
      await Promise.all([one, two]);
      expect(dispatch.dispatch).toHaveBeenCalledTimes(2);
    });

    it('releases the queued entry when the import delay fails, so a later announcement queues its own import', async () => {
      sleep.sleep.mockRejectedValueOnce(new Error('sleep broke'));
      dispatch.dispatch.mockResolvedValue(OUTCOME);

      const one = service.enqueue(TROPHY);
      const oneResult = await one;
      const two = service.enqueue({ ...TROPHY });

      expect(oneResult).toMatchObject({ failed: true });
      expect(two).not.toBe(one);
      await expect(two).resolves.toEqual({ failed: false });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
    });

    it('does not merge announcements for different competitions', async () => {
      const first = deferred<TpImportOutcome>();
      dispatch.dispatch
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(OUTCOME);

      const blocker = service.enqueue(BLOCKER);
      const one = service.enqueue(TROPHY);
      const two = service.enqueue(OTHER_TROPHY);

      expect(two).not.toBe(one);
      first.resolve(OUTCOME);
      await Promise.all([blocker, one, two]);
      expect(dispatch.dispatch).toHaveBeenCalledTimes(3);
    });

    it('does not merge other kinds of notification', async () => {
      const first = deferred<TpImportOutcome>();
      dispatch.dispatch
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(OUTCOME);

      const blocker = service.enqueue(BLOCKER);
      const one = service.enqueue(HIRED);
      const two = service.enqueue({ ...HIRED });

      expect(two).not.toBe(one);
      first.resolve(OUTCOME);
      await Promise.all([blocker, one, two]);
      expect(dispatch.dispatch).toHaveBeenCalledTimes(3);
    });
  });

  describe('queue', () => {
    it('waits the import delay before dispatching', async () => {
      const order: string[] = [];
      sleep.sleep.mockImplementation(() => {
        order.push('sleep');
        return Promise.resolve();
      });
      dispatch.dispatch.mockImplementation(() => {
        order.push('dispatch');
        return Promise.resolve(OUTCOME);
      });

      await service.enqueue(HIRED);

      expect(sleep.sleep).toHaveBeenCalledWith(TP_FEED_IMPORT_DELAY_MS);
      expect(order).toEqual(['sleep', 'dispatch']);
    });

    it('runs imports one at a time, in arrival order, each after its own delay', async () => {
      const first = deferred<TpImportOutcome>();
      dispatch.dispatch
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(OUTCOME);

      const otherLink = `${BASE}roster/999`;
      const one = service.enqueue(HIRED);
      const two = service.enqueue({ ...FIRED, link: otherLink });
      await flush();

      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
      expect(sleep.sleep).toHaveBeenCalledTimes(1);

      first.resolve(OUTCOME);
      await Promise.all([one, two]);

      expect(dispatch.dispatch).toHaveBeenCalledTimes(2);
      expect(sleep.sleep).toHaveBeenCalledTimes(2);
      expect(classifier.classify.mock.calls.map(([url]) => url)).toEqual([
        ROSTER_LINK,
        otherLink,
      ]);
    });

    it('keeps going when logging a failure throws', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementationOnce(() => {
        throw new Error('logger broke');
      });
      failure.assess.mockReturnValue(assessment('failed'));
      failure.isRealFailure.mockReturnValueOnce(true).mockReturnValue(false);

      const one = service.enqueue(HIRED);
      const two = service.enqueue(FIRED);

      await expect(one).resolves.toMatchObject({ failed: true });
      await expect(two).resolves.toEqual({ failed: false });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(2);
    });

    it('keeps going after a failed job', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      dispatch.dispatch
        .mockRejectedValueOnce(new Error('database down'))
        .mockResolvedValueOnce(OUTCOME);

      const one = service.enqueue(HIRED);
      const two = service.enqueue(FIRED);

      await expect(one).resolves.toMatchObject({ failed: true });
      await expect(two).resolves.toEqual({ failed: false });
    });
  });

  describe('TP blocks', () => {
    it('waits out a block and retries, reporting the retried import', async () => {
      dispatch.dispatch
        .mockRejectedValueOnce(blocked())
        .mockResolvedValueOnce(OUTCOME);

      await expect(service.enqueue(HIRED)).resolves.toEqual({ failed: false });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(2);
      expect(sleep.sleep.mock.calls).toEqual([
        [TP_FEED_IMPORT_DELAY_MS],
        [5 * MINUTE + TP_FEED_BLOCK_MARGIN_MS],
      ]);
    });

    it('waits only the margin when the block has already ended', async () => {
      clock.now.mockReturnValue(new Date(RETRY_AT.getTime() + MINUTE));
      dispatch.dispatch
        .mockRejectedValueOnce(blocked())
        .mockResolvedValueOnce(OUTCOME);

      await service.enqueue(HIRED);

      expect(sleep.sleep).toHaveBeenLastCalledWith(TP_FEED_BLOCK_MARGIN_MS);
    });

    it('announces a block once and its end once, however many jobs it hits', async () => {
      dispatch.dispatch
        .mockRejectedValueOnce(blocked())
        .mockRejectedValueOnce(blocked())
        .mockResolvedValue(OUTCOME);

      await Promise.all([service.enqueue(HIRED), service.enqueue(FIRED)]);

      expect(blockNotice.announceBlocked).toHaveBeenCalledTimes(1);
      expect(blockNotice.announceBlocked).toHaveBeenCalledWith(RETRY_AT);
      expect(blockNotice.announceResumed).toHaveBeenCalledTimes(1);
    });

    it('announces nothing when there was no block', async () => {
      await service.enqueue(HIRED);

      expect(blockNotice.announceBlocked).not.toHaveBeenCalled();
      expect(blockNotice.announceResumed).not.toHaveBeenCalled();
    });

    it('holds the jobs behind it back while it waits out a block', async () => {
      const wait = deferred<void>();
      sleep.sleep.mockImplementation((ms) =>
        ms === TP_FEED_IMPORT_DELAY_MS ? Promise.resolve() : wait.promise,
      );
      dispatch.dispatch
        .mockRejectedValueOnce(blocked())
        .mockResolvedValue(OUTCOME);

      const one = service.enqueue(HIRED);
      const two = service.enqueue(FIRED);
      await flush();
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);

      wait.resolve();
      await Promise.all([one, two]);
      expect(dispatch.dispatch).toHaveBeenCalledTimes(3);
    });

    it(`gives up after ${TP_FEED_BLOCK_RETRIES} retries, reporting a failure`, async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      dispatch.dispatch.mockRejectedValue(blocked());

      await expect(service.enqueue(HIRED)).resolves.toEqual({
        failed: true,
        headline:
          'TP import gave up: TP was still blocking requests after 3 retries',
        errors: [blocked().message],
      });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(
        TP_FEED_BLOCK_RETRIES + 1,
      );
      expect(blockNotice.announceBlocked).toHaveBeenCalledTimes(1);
      expect(blockNotice.announceResumed).not.toHaveBeenCalled();
    });

    it('still treats any other dispatch error as an unexpected failure, without retrying', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      dispatch.dispatch.mockRejectedValue(new Error('database down'));

      await expect(service.enqueue(HIRED)).resolves.toMatchObject({
        failed: true,
        headline: 'TP import failed unexpectedly',
      });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});

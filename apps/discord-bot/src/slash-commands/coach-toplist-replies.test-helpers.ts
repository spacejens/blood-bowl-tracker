import type { MockProxy } from 'vitest-mock-extended';

import type { CoachToplistService } from '../insights/facts/coach-toplist.service';
import { sampleEmbedReply } from './sample-embed-reply.test-helpers';

/**
 * Gives every `CoachToplistService` resolver a canned rendered reply, because
 * the real rendering belongs to that service's own spec.
 */
export function stubCoachToplistReplies(
  coachToplist: MockProxy<CoachToplistService>,
): void {
  coachToplist.resolveMatchesPlayed.mockResolvedValue(
    sampleEmbedReply('Coaches by matches played', '1. Roze Madder — 9'),
  );
  coachToplist.resolveMatchesWon.mockResolvedValue(
    sampleEmbedReply('Coaches by matches won', '1. Roze Madder — 5'),
  );
  coachToplist.resolveMatchesLost.mockResolvedValue(
    sampleEmbedReply('Coaches by matches lost', '1. Roze Madder — 3'),
  );
  coachToplist.resolveMatchesDrawn.mockResolvedValue(
    sampleEmbedReply('Coaches by matches drawn', '1. Roze Madder — 1'),
  );
  coachToplist.resolveTeams.mockResolvedValue(
    sampleEmbedReply('Coaches by teams', '1. Roze Madder — 3'),
  );
  coachToplist.resolveCompetitionsPlayed.mockResolvedValue(
    sampleEmbedReply('Coaches by competitions played', '1. Roze Madder — 5'),
  );
  coachToplist.resolveErasActive.mockResolvedValue(
    sampleEmbedReply('Coaches by eras active', '1. Roze Madder — 3'),
  );
  coachToplist.resolveFoulsCommitted.mockResolvedValue(
    sampleEmbedReply('Coaches by fouls committed', '1. Roze Madder — 8'),
  );
  coachToplist.resolveTimesSentOff.mockResolvedValue(
    sampleEmbedReply('Coaches by times sent off', '1. Roze Madder — 6'),
  );
  coachToplist.resolveTouchdownsScored.mockResolvedValue(
    sampleEmbedReply('Coaches by touchdowns scored', '1. Roze Madder — 42'),
  );
  coachToplist.resolveCompletions.mockResolvedValue(
    sampleEmbedReply('Coaches by completions', '1. Roze Madder — 30'),
  );
  coachToplist.resolveInterceptions.mockResolvedValue(
    sampleEmbedReply('Coaches by interceptions', '1. Roze Madder — 5'),
  );
  coachToplist.resolveDeflections.mockResolvedValue(
    sampleEmbedReply('Coaches by deflections', '1. Roze Madder — 8'),
  );
  coachToplist.resolveCasualtiesCaused.mockResolvedValue(
    sampleEmbedReply('Coaches by casualties inflicted', '1. Roze Madder — 57'),
  );
  coachToplist.resolveSeriousInjuriesCaused.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by serious injuries inflicted',
      '1. Roze Madder — 14',
    ),
  );
  coachToplist.resolveLastingInjuriesCaused.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by lasting injuries inflicted',
      '1. Roze Madder — 6',
    ),
  );
  coachToplist.resolveDeathsCaused.mockResolvedValue(
    sampleEmbedReply('Coaches by opponents killed', '1. Roze Madder — 4'),
  );
  coachToplist.resolveCasualtiesSuffered.mockResolvedValue(
    sampleEmbedReply('Coaches by casualties suffered', '1. Roze Madder — 41'),
  );
  coachToplist.resolveSeriousInjuriesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by serious injuries suffered',
      '1. Roze Madder — 11',
    ),
  );
  coachToplist.resolveLastingInjuriesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by lasting injuries suffered',
      '1. Roze Madder — 5',
    ),
  );
  coachToplist.resolveDeathsSuffered.mockResolvedValue(
    sampleEmbedReply('Coaches by deaths suffered', '1. Roze Madder — 3'),
  );
  coachToplist.resolveTrophiesWon.mockResolvedValue(
    sampleEmbedReply('Coaches by trophies won', '1. Roze Madder — 3'),
  );
  coachToplist.resolveTimeBetweenMatchesDescending.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by longest time between matches (highest first)',
      '1. Roze Madder — 45 days',
    ),
  );
  coachToplist.resolveTimeBetweenMatchesAscending.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by longest time between matches (lowest first)',
      '1. Roze Madder — 12 days',
    ),
  );
  coachToplist.resolveAverageTimeBetweenMatches.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by average time between matches (lowest first)',
      '1. Roze Madder — 8 days',
    ),
  );
}

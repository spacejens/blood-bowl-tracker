import { Injectable } from '@nestjs/common';

export type TpFileKind =
  | { kind: 'match'; matchId: string }
  | { kind: 'rosters'; rosterId: string }
  | { kind: 'tournament'; slug: string; subpage: string | null }
  | { kind: 'awards'; slug: string }
  | { kind: 'inscriptions'; slug: string }
  | { kind: 'rosters-masters'; ruleSetId: string }
  | { kind: 'other' };

const MATCH = /^match_(\d+)\.json$/u;
const ROSTERS = /^rosters_(\d+)\.json$/u;
const ROSTERS_MASTERS = /^rosters_masters\?ruleSet=(\d+)\.json$/u;
/** TP slugs use hyphens, never underscores, so the first `_` after the slug starts a subpage. */
const TOURNAMENT = /^tournament_([^_]+)(?:_(.+))?\.json$/u;
const AWARDS = /^awards_([^_]+)_awards\.json$/u;
const INSCRIPTIONS = /^inscriptions_([^_]+)_inscriptions\.json$/u;

/**
 * What kind of TP file a download-tp filename is, with the ids or slug its
 * name carries. Mechanical: it reads names only, never contents.
 */
@Injectable()
export class TpFileNameService {
  classify(filename: string): TpFileKind {
    const match = MATCH.exec(filename);
    if (match) {
      return { kind: 'match', matchId: match[1] };
    }
    const rosters = ROSTERS.exec(filename);
    if (rosters) {
      return { kind: 'rosters', rosterId: rosters[1] };
    }
    const masters = ROSTERS_MASTERS.exec(filename);
    if (masters) {
      return { kind: 'rosters-masters', ruleSetId: masters[1] };
    }
    const tournament = TOURNAMENT.exec(filename);
    if (tournament) {
      return {
        kind: 'tournament',
        slug: tournament[1],
        subpage: tournament[2] ?? null,
      };
    }
    const awards = AWARDS.exec(filename);
    if (awards) {
      return { kind: 'awards', slug: awards[1] };
    }
    const inscriptions = INSCRIPTIONS.exec(filename);
    if (inscriptions) {
      return { kind: 'inscriptions', slug: inscriptions[1] };
    }
    return { kind: 'other' };
  }
}

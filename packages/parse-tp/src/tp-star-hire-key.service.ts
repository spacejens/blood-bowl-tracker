import { Injectable } from '@nestjs/common';

/** Options for {@link TpStarHireKeyService.externalId}. */
export interface TpStarHireKeyOptions {
  /** TP roster id of the team that hired the star. */
  rosterId: number;
  /** The star's `lineUpMasterId`, as TP's `inducements_roll` event gives it. */
  lineUpMasterId: number;
}

/**
 * The TP external id of a hired star player. A star hired for a match is on
 * no roster's `lineUps[]`, so TP gives it no player id. Each hire is one
 * player row per hiring roster and star, keyed
 * `star-<rosterId>-<lineUpMasterId>`. packages/import-tp-live's server-side
 * hire import keys the row through this service, and both the bulk run
 * (through `tpMatches.import`) and the live match import reach it, so
 * re-importing the same hire from either updates one row.
 * Constructor-free formatting, so specs may pass it as a real provider.
 */
@Injectable()
export class TpStarHireKeyService {
  externalId({ rosterId, lineUpMasterId }: TpStarHireKeyOptions): string {
    return `star-${rosterId}-${lineUpMasterId}`;
  }
}

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
 * `star-<rosterId>-<lineUpMasterId>`. tools/import-tp's bulk hire pass and
 * packages/import-tp-live's live hire import both key the row through this
 * service, so either path re-importing the same hire updates one row.
 * Constructor-free formatting, so specs may pass it as a real provider.
 */
@Injectable()
export class TpStarHireKeyService {
  externalId({ rosterId, lineUpMasterId }: TpStarHireKeyOptions): string {
    return `star-${rosterId}-${lineUpMasterId}`;
  }
}

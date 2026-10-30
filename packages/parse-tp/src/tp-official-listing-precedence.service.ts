import { Injectable } from '@nestjs/common';

/** One listing of a position on TP's official team list, as precedence sees it. */
export interface TpOfficialListing {
  /** Whether it came from an official roster rather than a legacy one. */
  isOfficial: boolean;
}

/** Options for {@link TpOfficialListingPrecedenceService.replaces}. */
export interface TpOfficialListingPrecedenceOptions {
  /** The listing already kept. */
  current: TpOfficialListing;
  /** A listing met later, for the same position. */
  candidate: TpOfficialListing;
}

/**
 * Which listing's values a position keeps when TP lists it more than once:
 * under an official and a legacy roster of one race, or (for a star player)
 * under several races. An official listing beats a legacy one regardless of
 * order; otherwise the later listing wins. packages/import-tp-live's
 * position upsert and tools/import-tp's star normalization both decide
 * through this service, so the values a request writes never depend on
 * which side chose them. Constructor-free, so specs may pass it as a real
 * provider.
 */
@Injectable()
export class TpOfficialListingPrecedenceService {
  replaces({
    current,
    candidate,
  }: TpOfficialListingPrecedenceOptions): boolean {
    return candidate.isOfficial || !current.isOfficial;
  }
}

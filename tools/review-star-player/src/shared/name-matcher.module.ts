import { Module } from '@nestjs/common';

import { StarPlayerNameMatcherService } from './star-player-name-matcher.service';

/**
 * Isolated from `SharedModule` so `SourceModule` can depend on the name
 * matcher without depending on all of `SharedModule` — which itself imports
 * `SourceModule` for `StarSourceLookupService`'s dependency on BBL's and
 * TP's raw source services, so `SourceModule` importing `SharedModule` back
 * would cycle. `StarPlayerNameMatcherService` is pure and dependency-free,
 * so this module needs no imports of its own.
 */
@Module({
  providers: [StarPlayerNameMatcherService],
  exports: [StarPlayerNameMatcherService],
})
export class NameMatcherModule {}

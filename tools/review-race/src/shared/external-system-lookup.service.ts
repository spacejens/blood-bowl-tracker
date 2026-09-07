import { createExternalSystemLookupServiceBase } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import {
  CONFIG_FILE_NAME,
  RaceReviewConfigService,
} from '../config/review-race-config.service';

/**
 * Resolves each source's `external_systems.id` from its configured name, once
 * per process. Only meaningful for `'bbl'` and `'tp'`: the hand-curated
 * `'manual'` data registers into those systems' id spaces (and the
 * bookkeeping "Name" system) rather than one of its own, so nothing calls
 * this with `'manual'`.
 */
@Injectable()
export class ExternalSystemLookupService extends createExternalSystemLookupServiceBase(
  RaceReviewConfigService,
  CONFIG_FILE_NAME,
) {}

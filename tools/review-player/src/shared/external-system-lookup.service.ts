import { createExternalSystemLookupServiceBase } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import {
  CONFIG_FILE_NAME,
  ReviewPlayerConfigService,
} from '../config/review-player-config.service';

/**
 * Resolves each source's `external_systems.id` from its configured name, once
 * per process. Every query that joins a source's external ids needs this id,
 * so it is memoized rather than re-queried per stratum.
 */
@Injectable()
export class ExternalSystemLookupService extends createExternalSystemLookupServiceBase(
  ReviewPlayerConfigService,
  CONFIG_FILE_NAME,
) {}

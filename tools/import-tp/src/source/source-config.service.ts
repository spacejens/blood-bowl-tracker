import { createSourceConfigServiceBase } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

/**
 * Reads `dataDir`: the absolute path to the folder that directly contains one
 * subdirectory per era. A relative dataDir resolves against the current
 * working directory; an absolute value is used as-is.
 */
@Injectable()
export class SourceConfigService extends createSourceConfigServiceBase({
  configService: ImportTpConfigService,
  fileName: 'import-tp-config.json5',
  dataDirDescription: 'containing one subdirectory per era (e.g. data/)',
}) {}

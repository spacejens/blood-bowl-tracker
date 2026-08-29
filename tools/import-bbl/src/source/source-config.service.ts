import { createSourceConfigServiceBase } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

/**
 * Reads `dataDir`: the absolute path to the folder that directly contains the
 * BBL `default.asp?p=...` files. A relative dataDir resolves against the
 * current working directory; an absolute value is used as-is.
 */
@Injectable()
export class SourceConfigService extends createSourceConfigServiceBase({
  configService: ImportBblConfigService,
  fileName: 'import-bbl-config.json5',
  dataDirDescription:
    'containing the BBL default.asp files (e.g. data/tloeg.bbleague.se/)',
}) {}

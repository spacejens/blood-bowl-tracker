import { resolve } from 'node:path';

import { nonEmptyStringSchema } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

@Injectable()
export class SourceConfigService {
  constructor(private readonly config: ImportTpConfigService) {}

  /**
   * Absolute path to the folder that directly contains one subdirectory per
   * era. A relative dataDir resolves against the current working directory; an
   * absolute value is used as-is.
   */
  getDataDir(): string {
    const parsed = nonEmptyStringSchema.safeParse(this.config.get('dataDir'));
    if (!parsed.success) {
      throw new Error(
        'dataDir is not set in import-tp-config.json5. Set it to the folder ' +
          'containing one subdirectory per era (e.g. data/).',
      );
    }
    return resolve(parsed.data);
  }
}

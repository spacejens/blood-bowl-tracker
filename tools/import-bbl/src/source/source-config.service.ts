import { resolve } from 'node:path';

import { nonEmptyStringSchema } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

@Injectable()
export class SourceConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * Absolute path to the folder that directly contains the BBL
   * `default.asp?p=...` files. A relative dataDir resolves against the current
   * working directory; an absolute value is used as-is.
   */
  getDataDir(): string {
    const parsed = nonEmptyStringSchema.safeParse(this.config.get('dataDir'));
    if (!parsed.success) {
      throw new Error(
        'dataDir is not set in import-bbl-config.json5. Set it to the folder ' +
          'containing the BBL default.asp files (e.g. data/tloeg.bbleague.se/).',
      );
    }
    return resolve(parsed.data);
  }
}

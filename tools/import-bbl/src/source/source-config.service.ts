import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SourceConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Absolute path to the folder that directly contains the BBL
   * `default.asp?p=...` files. A relative BBL_DATA_DIR resolves against the
   * current working directory; an absolute value is used as-is.
   */
  getDataDir(): string {
    const dir = this.configService.get<string>('BBL_DATA_DIR');
    if (!dir) {
      throw new Error(
        'BBL_DATA_DIR is not set. Set it to the folder containing the BBL ' +
          'default.asp files (e.g. data/tloeg.bbleague.se/).',
      );
    }
    return resolve(dir);
  }
}

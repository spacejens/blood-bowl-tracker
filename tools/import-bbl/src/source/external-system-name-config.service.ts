import { createExternalSystemNameConfigServiceBase } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

@Injectable()
export class ExternalSystemNameConfigService extends createExternalSystemNameConfigServiceBase(
  {
    configService: ImportBblConfigService,
    defaultSystemName: 'BBL',
  },
) {
  /**
   * The name of the external system BBL records are registered under (the
   * canonical external system for imported leagues, coaches, and races).
   * Supplied via the externalSystemName config key. Unlike the other
   * import-bbl config getters, this one never throws: an unset or empty value
   * yields the default "BBL".
   */
  getBblSystemName(): string {
    return this.getSystemName();
  }
}

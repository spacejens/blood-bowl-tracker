import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

@Injectable()
export class ExternalSystemNameConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * The name of the external system BBL records are registered under (the
   * canonical external system for imported leagues, coaches, and races).
   * Supplied via the externalSystemName config key. Unlike the other
   * import-bbl config getters, this one never throws: an unset or empty value
   * yields the default "BBL".
   */
  getBblSystemName(): string {
    const name = this.config.get<string>('externalSystemName');
    return name && name.trim() !== '' ? name : 'BBL';
  }
}

import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

@Injectable()
export class ExternalSystemNameConfigService {
  constructor(private readonly config: ImportTpConfigService) {}

  /**
   * The name of the external system TP records are registered under (the
   * canonical external system for imported leagues, rule sets, and eras).
   * Supplied via the externalSystemName config key. Unlike the other
   * import-tp config getters, this one never throws: an unset or empty value
   * yields the default "TP".
   */
  getTpSystemName(): string {
    const name = this.config.get<string>('externalSystemName');
    return name && name.trim() !== '' ? name : 'TP';
  }
}

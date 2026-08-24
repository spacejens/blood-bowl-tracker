import { externalSystemNameSchema } from '@blood-bowl-tracker/import';
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
    const parsed = externalSystemNameSchema.safeParse(
      this.config.get('externalSystemName'),
    );
    return parsed.success ? parsed.data : 'BBL';
  }
}

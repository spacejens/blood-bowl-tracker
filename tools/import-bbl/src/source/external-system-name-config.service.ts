import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExternalSystemNameConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * The name of the external system BBL records are registered under (the
   * canonical external system for imported leagues, coaches, and races).
   * Supplied via the BBL_EXTERNAL_SYSTEM_NAME environment variable. Unlike the
   * other import-bbl config getters, this one never throws: an unset or empty
   * value yields the default "BBL".
   */
  getBblSystemName(): string {
    const name = this.configService.get<string>('BBL_EXTERNAL_SYSTEM_NAME');
    return name && name.trim() !== '' ? name : 'BBL';
  }
}

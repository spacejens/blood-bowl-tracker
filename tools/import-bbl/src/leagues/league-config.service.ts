import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LeagueConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * The name of the single league covered by the BBL data mirror. Supplied via
   * the BBL_LEAGUE_NAME environment variable (the name is not parsed from the
   * source data). Used as the league's external ID under both the BBL and Name
   * external systems.
   */
  getLeagueName(): string {
    const name = this.configService.get<string>('BBL_LEAGUE_NAME');
    if (!name) {
      throw new Error(
        'BBL_LEAGUE_NAME is not set. Set it to the name of the league the ' +
          'BBL data covers (e.g. "tLoEG").',
      );
    }
    return name;
  }
}

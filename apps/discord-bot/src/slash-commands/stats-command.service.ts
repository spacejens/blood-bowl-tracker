import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { StatsSummaryService } from '../insights/stats-summary.service';

@Injectable()
export class StatsCommandService implements OnApplicationBootstrap {
  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly statsSummary: StatsSummaryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.discordClient.registerCommands([
      {
        name: 'stats',
        description:
          'Show how many coaches, teams, matches, and competitions have been recorded',
        execute: () => this.statsSummary.buildSummaryMessage(),
      },
    ]);
  }
}

import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { StatsSummaryService } from '../insights/stats-summary.service';

@Injectable()
export class StatsCommandService implements OnApplicationBootstrap {
  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly statsSummary: StatsSummaryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // registerCommands replaces a guild's full command list, so every slash
    // command must be registered in this single call. If more commands are
    // added, extend this array rather than calling registerCommands again from
    // another service — a second call would overwrite these commands.
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

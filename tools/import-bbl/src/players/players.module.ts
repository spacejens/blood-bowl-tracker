import { Module } from '@nestjs/common';

import { PlayerPageParser } from './player-page-parser';

@Module({
  providers: [PlayerPageParser],
  exports: [PlayerPageParser],
})
export class PlayersModule {}

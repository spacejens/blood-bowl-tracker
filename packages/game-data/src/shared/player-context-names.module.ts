import { Module } from '@nestjs/common';

import { PlayerContextNamesService } from './player-context-names.service';

@Module({
  providers: [PlayerContextNamesService],
  exports: [PlayerContextNamesService],
})
export class PlayerContextNamesModule {}

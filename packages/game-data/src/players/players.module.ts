import { Module } from '@nestjs/common';

import { CharacteristicFormatValidationModule } from '../shared/characteristic-format-validation.module';
import { PlayerCharacteristicsValidationService } from './player-characteristics-validation.service';
import { PlayerLastingInjuryBackfillService } from './player-lasting-injury-backfill.service';
import { PlayerLastingInjuryValidationService } from './player-lasting-injury-validation.service';
import { PlayersService } from './players.service';

@Module({
  imports: [CharacteristicFormatValidationModule],
  providers: [
    PlayersService,
    PlayerCharacteristicsValidationService,
    PlayerLastingInjuryBackfillService,
    PlayerLastingInjuryValidationService,
  ],
  exports: [PlayersService, PlayerLastingInjuryBackfillService],
})
export class PlayersModule {}

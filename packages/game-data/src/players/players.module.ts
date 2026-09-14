import { Module } from '@nestjs/common';

import { CharacteristicFormatValidationModule } from '../shared/characteristic-format-validation.module';
import { LikePatternModule } from '../shared/like-pattern.module';
import { MatchEventCountsModule } from '../shared/match-event-counts.module';
import { PlayerContextNamesModule } from '../shared/player-context-names.module';
import { SppModule } from '../spp/spp.module';
import { PlayerCharacteristicsValidationService } from './player-characteristics-validation.service';
import { PlayerDeathService } from './player-death.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';
import { PlayerLastingInjuryBackfillService } from './player-lasting-injury-backfill.service';
import { PlayerLastingInjuryValidationService } from './player-lasting-injury-validation.service';
import { PlayersService } from './players.service';
import { StarPlayersService } from './star-players.service';

@Module({
  imports: [
    CharacteristicFormatValidationModule,
    LikePatternModule,
    MatchEventCountsModule,
    PlayerContextNamesModule,
    SppModule,
  ],
  providers: [
    PlayersService,
    PlayerCharacteristicsValidationService,
    PlayerDeathService,
    PlayerDeepdiveCountsService,
    PlayerLastingInjuryBackfillService,
    PlayerLastingInjuryValidationService,
    StarPlayersService,
  ],
  exports: [
    PlayersService,
    PlayerDeathService,
    PlayerLastingInjuryBackfillService,
    StarPlayersService,
  ],
})
export class PlayersModule {}

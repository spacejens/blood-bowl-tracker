import { Module } from '@nestjs/common';

import { CharacteristicDisplayFormattingService } from './characteristic-display-formatting.service';

@Module({
  providers: [CharacteristicDisplayFormattingService],
  exports: [CharacteristicDisplayFormattingService],
})
export class CharacteristicDisplayFormattingModule {}

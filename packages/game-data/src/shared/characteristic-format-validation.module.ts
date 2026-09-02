import { Module } from '@nestjs/common';

import { CharacteristicFormatValidationService } from './characteristic-format-validation.service';

@Module({
  providers: [CharacteristicFormatValidationService],
  exports: [CharacteristicFormatValidationService],
})
export class CharacteristicFormatValidationModule {}

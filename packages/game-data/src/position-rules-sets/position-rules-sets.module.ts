import { Module } from '@nestjs/common';

import { CharacteristicFormatValidationModule } from '../shared/characteristic-format-validation.module';
import { PositionRulesSetsService } from './position-rules-sets.service';

@Module({
  imports: [CharacteristicFormatValidationModule],
  providers: [PositionRulesSetsService],
  exports: [PositionRulesSetsService],
})
export class PositionRulesSetsModule {}

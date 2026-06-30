import { Module } from '@nestjs/common';
import { ErasController } from './eras.controller';
import { ErasService } from './eras.service';

@Module({ controllers: [ErasController], providers: [ErasService] })
export class ErasModule {}

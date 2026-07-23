import { Injectable } from '@nestjs/common';

import { type WeatherType, weatherTypeByCode } from './weather-type';

@Injectable()
export class WeatherTypeService {
  decode(code: number): WeatherType {
    return weatherTypeByCode[code] ?? 'unknown';
  }
}

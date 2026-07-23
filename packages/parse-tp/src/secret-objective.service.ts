import { Injectable } from '@nestjs/common';

import {
  type SecretObjective,
  secretObjectiveByCode,
} from './secret-objective';

@Injectable()
export class SecretObjectiveService {
  decode(code: number): SecretObjective {
    return secretObjectiveByCode[code] ?? 'unknown';
  }
}

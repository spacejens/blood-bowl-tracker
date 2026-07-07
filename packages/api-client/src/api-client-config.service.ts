import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiClientConfigService {
  constructor(private readonly configService: ConfigService) {}

  getApiBaseUrl(): string {
    return this.configService.get<string>(
      'API_BASE_URL',
      'http://localhost:3000',
    );
  }
}

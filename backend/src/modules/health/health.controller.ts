import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Verifies API liveness and database connectivity via HealthService.
   */
  @Get()
  @ApiOperation({ summary: 'Verifica o status da API e conexão com o banco' })
  async check() {
    return this.healthService.check();
  }
}


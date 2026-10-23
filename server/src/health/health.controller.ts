import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const MIN_FREE_BYTES = 100 * 1024 * 1024;

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.checkStorage('storage', tmpdir(), MIN_FREE_BYTES),
      // The local OPUS-MT model runs in this process (~200 MB RSS): thresholds
      // must leave room for it, otherwise a healthy server reports 503.
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 2048 * 1024 * 1024),
    ]);
  }

  /**
   * Terminus' DiskHealthIndicator calls `check-disk-space` in a way that breaks
   * with its current dual CJS/ESM build ("checkDiskSpace is not a function").
   * `fs.statfs` is built into Node and works on Windows too.
   */
  private async checkStorage(
    key: string,
    path: string,
    threshold: number,
  ): Promise<HealthIndicatorResult> {
    const stats = await statfs(path);
    const free = Number(stats.bavail) * Number(stats.bsize);

    if (free < threshold) {
      throw new HealthCheckError('storage check failed', {
        [key]: { status: 'down', free },
      });
    }

    return { [key]: { status: 'up', free } };
  }
}

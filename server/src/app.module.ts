import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { RateLimitMiddleware } from './common/middlewares/rate-limit.middleware';
import { HealthModule } from './health/health.module';
import { LyricsModule } from './lyrics/lyrics.module';
import { RadioModule } from './radio/radio.module';
import { RecognitionModule } from './recognition/recognition.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'server/.env'] }),
    // cache-manager v5 expects milliseconds.
    CacheModule.register({ isGlobal: true, ttl: 300_000 }),
    HttpModule.register({ timeout: 30_000 }),
    RecognitionModule,
    LyricsModule,
    RadioModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

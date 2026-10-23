import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LyricsController } from './lyrics.controller';
import { LyricsService } from './lyrics.service';
import { TranslationService } from './translation.service';

@Module({
  // The cache is registered globally in AppModule: importing CacheModule here
  // without options would create a second, unconfigured cache provider.
  imports: [HttpModule],
  controllers: [LyricsController],
  providers: [LyricsService, TranslationService],
  exports: [LyricsService, TranslationService],
})
export class LyricsModule {}

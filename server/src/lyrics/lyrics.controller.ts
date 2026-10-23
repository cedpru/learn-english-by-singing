import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  KaraokePayloadDto,
  KaraokeRequestDto,
} from '../common/types';
import { LyricsService, SearchEntry } from './lyrics.service';

@ApiTags('Lyrics')
@Controller('lyrics')
export class LyricsController {
  constructor(private readonly lyricsService: LyricsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for lyrics' })
  @ApiQuery({ name: 'q', description: 'Search query (title, artist, album)' })
  search(@Query('q') query?: string): Promise<SearchEntry[]> {
    return this.lyricsService.searchLyrics(query ?? '');
  }

  @Post('karaoke')
  @ApiOperation({ summary: 'Get synced lyrics and their French translation for a track' })
  @ApiBody({ type: KaraokeRequestDto })
  async karaoke(@Body() body: KaraokeRequestDto): Promise<KaraokePayloadDto> {
    const manual = body.rawLyrics?.trim() ? body.rawLyrics : undefined;

    // Lyrics pasted by the user replace the (sometimes missing) online entry.
    const result = manual ? null : await this.lyricsService.findLyrics(body.track);
    const parsed = manual
      ? { ...this.lyricsService.lyricsFromText(manual), instrumental: false }
      : this.lyricsService.lyricsFromResult(result);

    const track = {
      ...body.track,
      album: body.track.album ?? result?.albumName,
      duration: body.track.duration ?? result?.duration,
    };

    return this.lyricsService.getKaraokePayload(
      track,
      manual,
      parsed.lines,
      parsed.synced,
      parsed.wordSync,
      parsed.instrumental,
      manual ? 'manuel' : result ? 'LRCLIB' : 'aucun',
    );
  }
}

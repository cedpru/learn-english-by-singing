import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LyricLineDto } from './lyric-line.dto';
import { SongRefDto } from './song-ref.dto';

export enum TranslationStatus {
  OK = 'ok',
  EMPTY = 'empty',
  ALREADY_TARGET = 'already-target',
  UNSUPPORTED = 'unsupported',
  APPROXIMATE = 'approximate',
}

export enum SourceLang {
  EN = 'en',
  FR = 'fr',
  OTHER = 'other',
}

export class KaraokePayloadDto {
  track: SongRefDto;

  @IsArray()
  lines: LyricLineDto[];

  @IsBoolean()
  synced: boolean;

  @IsBoolean()
  wordSync: boolean;

  @IsBoolean()
  instrumental: boolean;

  @IsEnum(SourceLang)
  sourceLang: SourceLang;

  @IsEnum(TranslationStatus)
  translation: TranslationStatus;

  @IsString()
  provider: string;
}

/** Corps de POST /api/lyrics/karaoke. */
export class KaraokeRequestDto {
  @ValidateNested()
  @Type(() => SongRefDto)
  track: SongRefDto;

  /** Paroles collées ou saisies à la main : elles remplacent la recherche en ligne. */
  @IsString()
  @IsOptional()
  @MaxLength(40_000)
  rawLyrics?: string;
}

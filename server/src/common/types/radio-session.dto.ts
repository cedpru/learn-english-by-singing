import { IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';
import { SongRefDto } from './song-ref.dto';

export enum RadioStatus {
  CONNECTING = 'connecting',
  LIVE = 'live',
  NO_METADATA = 'no-metadata',
  ERROR = 'error',
}

export enum SyncStatus {
  MATCHED = 'matched',
  NO_MATCH = 'no_match',
}

export class RadioSessionDto {
  @IsString()
  id: string;

  @IsString()
  url: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  artist?: string | null;

  @IsString()
  @IsOptional()
  title?: string | null;

  @IsString()
  @IsOptional()
  album?: string | null;

  @IsEnum(RadioStatus)
  status: RadioStatus;

  /** epoch ms du dernier changement de titre (ancre de l'horloge des paroles). */
  @IsNumber()
  @IsOptional()
  changedAt?: number | null;
}

export class StreamSyncDto {
  @IsEnum(SyncStatus)
  status: SyncStatus;

  @IsOptional()
  track?: SongRefDto;

  /** Position du clip capturé dans le morceau, en secondes. */
  @IsNumber()
  @IsOptional()
  offset?: number;

  /** epoch ms du début de la capture (ancre de l'horloge). */
  @IsNumber()
  capturedAt: number;

  @IsNumber()
  clipSeconds: number;
}

/** Corps de POST /api/radio. */
export class StartRadioDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;

  @IsString()
  @IsOptional()
  name?: string;
}

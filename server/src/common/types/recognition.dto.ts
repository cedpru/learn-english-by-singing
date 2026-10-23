import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { SongRefDto } from './song-ref.dto';

export enum RecognitionStatus {
  MATCHED = 'matched',
  NO_MATCH = 'no_match',
}

export class RecognitionResultDto {
  @IsEnum(RecognitionStatus)
  status: RecognitionStatus;

  @IsOptional()
  track?: SongRefDto;

  /** Position du clip dans le morceau, en secondes. */
  @IsNumber()
  @IsOptional()
  offset?: number;
}

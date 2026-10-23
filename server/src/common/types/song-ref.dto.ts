import { IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class SongRefDto {
  @IsString()
  title: string;

  @IsString()
  artist: string;

  @IsString()
  @IsOptional()
  album?: string;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsUrl()
  @IsOptional()
  cover?: string;

  @IsString()
  @IsOptional()
  isrc?: string;

  /** Position (secondes) du clip reconnu dans le morceau. */
  @IsNumber()
  @IsOptional()
  offset?: number;
}

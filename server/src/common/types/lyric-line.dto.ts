import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class LyricWordDto {
  @IsNumber()
  t: number;

  @IsString()
  text: string;
}

export class LyricLineDto {
  @IsNumber()
  @IsOptional()
  t?: number | null;

  @IsString()
  text: string;

  /** Traduction française, remplie par /api/lyrics/karaoke. */
  @IsString()
  @IsOptional()
  fr?: string;

  @IsArray()
  @IsOptional()
  words?: LyricWordDto[];
}

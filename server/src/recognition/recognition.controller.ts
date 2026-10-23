import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import {
  RecognitionResultDto,
  RecognitionStatus,
} from '../common/types';
import { RecognitionService } from './recognition.service';

export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

@ApiTags('Recognition')
@Controller('recognize')
export class RecognitionController {
  constructor(private readonly recognitionService: RecognitionService) {}

  @Post()
  @ApiOperation({ summary: 'Recognize audio from microphone or stream' })
  @ApiConsumes('application/octet-stream', 'multipart/form-data')
  @ApiBody({
    description: 'Raw audio (WebM, Opus, WAV, MP3) or a multipart field named "audio"',
    schema: { type: 'string', format: 'binary' },
  })
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES },
    }),
  )
  async recognize(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request,
  ): Promise<RecognitionResultDto> {
    // Raw body is parsed by the express raw middleware in main.ts; multipart by multer.
    const buffer = file?.buffer ?? (Buffer.isBuffer(request.body) ? request.body : undefined);

    if (!buffer?.length) {
      throw new BadRequestException('clip audio vide');
    }

    const result = await this.recognitionService.recognizeAudio(buffer);
    return result ?? { status: RecognitionStatus.NO_MATCH };
  }
}

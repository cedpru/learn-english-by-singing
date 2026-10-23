import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RecognitionModule } from '../recognition/recognition.module';
import { RadioController } from './radio.controller';
import { RadioGateway } from './radio.gateway';
import { RadioService } from './radio.service';

@Module({
  imports: [HttpModule, RecognitionModule],
  controllers: [RadioController],
  providers: [RadioService, RadioGateway],
  exports: [RadioService],
})
export class RadioModule {}

import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NotFoundCustomException } from '../common/exceptions/custom-exceptions';
import {
  RadioSessionDto,
  StartRadioDto,
  StreamSyncDto,
} from '../common/types';
import { RadioService } from './radio.service';

@ApiTags('Radio')
@Controller('radio')
export class RadioController {
  constructor(private readonly radioService: RadioService) {}

  @Get('presets')
  @ApiOperation({ summary: 'Get predefined radio stations' })
  getPresets() {
    return this.radioService.getPresets();
  }

  @Get()
  @ApiOperation({ summary: 'List all active radio sessions' })
  listRadios(): RadioSessionDto[] {
    return this.radioService.listRadios();
  }

  @Post()
  @ApiOperation({ summary: 'Start a new radio session' })
  @ApiBody({ type: StartRadioDto })
  startRadio(@Body() body: StartRadioDto): RadioSessionDto {
    return this.radioService.startRadio(body.url, body.name);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Sync with radio stream' })
  @ApiParam({ name: 'id', description: 'Radio session ID' })
  async syncRadio(@Param('id') id: string): Promise<StreamSyncDto> {
    return this.radioService.syncRadio(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get radio session by ID' })
  @ApiParam({ name: 'id', description: 'Radio session ID' })
  getRadio(@Param('id') id: string): RadioSessionDto {
    const session = this.radioService.getRadio(id);
    if (!session) throw new NotFoundCustomException('Session introuvable', 'SESSION_NOT_FOUND');
    return session;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Stop a radio session' })
  @ApiParam({ name: 'id', description: 'Radio session ID' })
  stopRadio(@Param('id') id: string): { ok: boolean } {
    return { ok: this.radioService.stopRadio(id) };
  }
}

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EvaService, EvaChatResult } from './eva.service';

class EvaChatDto {
  @IsString()
  @MinLength(1)
  message: string;
}

@UseGuards(JwtAuthGuard)
@Controller('eva')
export class EvaController {
  constructor(private readonly evaService: EvaService) {}

  @Post('chat')
  async chat(@Body() dto: EvaChatDto): Promise<EvaChatResult> {
    return this.evaService.chat(dto.message);
  }
}

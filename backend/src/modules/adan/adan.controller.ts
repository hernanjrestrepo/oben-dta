import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ValidationPipe,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, MinLength, IsOptional } from 'class-validator';
import { AdanService, AdanAnswer } from './adan.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Tipo mínimo del archivo subido (evita depender de @types/multer).
interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
}

class AskDto {
  @IsString()
  @MinLength(3)
  question: string;
}

class IngestTextDto {
  @IsString()
  @MinLength(2)
  fileName: string;

  @IsString()
  @IsOptional()
  fileType?: string;

  @IsString()
  @MinLength(1)
  content: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('adan')
export class AdanController {
  constructor(private readonly adan: AdanService) {}

  @Post('ask')
  @RequirePermission('adan.ask')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async ask(@Body() dto: AskDto): Promise<AdanAnswer> {
    return this.adan.ask(dto.question);
  }

  @Post('ingest-text')
  @RequirePermission('adan.ingest')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async ingestText(
    @Body() dto: IngestTextDto,
    @CurrentUser('sub') userId: string,
  ) {
    const fileType =
      dto.fileType ?? (dto.fileName.split('.').pop() || 'txt').toLowerCase();
    return this.adan.ingest(dto.fileName, fileType, dto.content, userId);
  }

  @Post('ingest')
  @RequirePermission('adan.ingest')
  @UseInterceptors(FileInterceptor('file'))
  async ingestFile(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser('sub') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo (campo file)');
    }
    const fileType = (file.originalname.split('.').pop() || '').toLowerCase();
    return this.adan.ingest(file.originalname, fileType, file.buffer, userId);
  }

  @Get('documents')
  @RequirePermission('adan.read')
  async documents() {
    return this.adan.listDocuments();
  }

  @Get('stats')
  @RequirePermission('adan.read')
  async stats() {
    return this.adan.stats();
  }
}

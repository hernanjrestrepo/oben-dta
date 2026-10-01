import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormatoEnvio } from '../../entities/formato-envio.entity';
import { AuthModule } from '../auth/auth.module';
import { FormatosService } from './formatos.service';
import { FormatosController } from './formatos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FormatoEnvio]), AuthModule],
  controllers: [FormatosController],
  providers: [FormatosService],
  exports: [FormatosService],
})
export class FormatosModule {}

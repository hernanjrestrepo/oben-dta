import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { TraduccionController } from './traduccion.controller';
import { TraduccionInterceptor, TraductorService } from './traductor.service';

/** Oben Xmart en español, inglés, portugués y francés: traductor del servidor con caché (24-oct). */
@Global()
@Module({
  // AuthModule: el controlador usa JwtAuthGuard, que necesita JwtService.
  imports: [AuthModule],
  controllers: [TraduccionController],
  providers: [TraductorService, { provide: APP_INTERCEPTOR, useClass: TraduccionInterceptor }],
  exports: [TraductorService],
})
export class TraduccionModule {}

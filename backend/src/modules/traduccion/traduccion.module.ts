import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TraduccionController } from './traduccion.controller';
import { TraduccionInterceptor, TraductorService } from './traductor.service';

/** Oben Xmart en español, inglés, portugués y francés: traductor del servidor con caché (24-oct). */
@Global()
@Module({
  controllers: [TraduccionController],
  providers: [TraductorService, { provide: APP_INTERCEPTOR, useClass: TraduccionInterceptor }],
  exports: [TraductorService],
})
export class TraduccionModule {}

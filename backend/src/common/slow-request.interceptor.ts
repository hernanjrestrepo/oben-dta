import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, finalize } from 'rxjs';

/** Desde cuántos milisegundos una petición se considera lenta y queda en el log. */
export const UMBRAL_PETICION_LENTA_MS = 2000;

/**
 * Deja en el log toda petición HTTP que tarde más de 2 s, con la ruta y el
 * tiempo. Hernán reportó el 16-oct que cargar una proforma estaba "supremamente
 * demorado", pero medido en el servidor todo respondía en menos de 0,5 s: sin
 * este registro no había forma de saber qué petición fue la lenta ni cuándo.
 */
@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PeticionLenta');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const inicio = Date.now();
    return next.handle().pipe(
      finalize(() => {
        const ms = Date.now() - inicio;
        if (ms >= UMBRAL_PETICION_LENTA_MS) this.logger.warn(`${req.method} ${req.originalUrl ?? req.url} tardó ${ms} ms`);
      }),
    );
  }
}

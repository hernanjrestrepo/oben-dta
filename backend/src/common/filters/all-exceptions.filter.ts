import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { DataSource } from 'typeorm';
import { moduloDeRuta } from '../../modules/academy/academy-catalogo';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** Con `ds`, cada error de un usuario en un módulo queda como fricción de Xmart Academy (sin bloquear la respuesta). */
  constructor(private readonly ds?: DataSource) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    let sanitizedMessage: string;
    if (typeof message === 'string') {
      sanitizedMessage = message;
    } else if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message &&
      typeof (message as Record<string, unknown>).message === 'string'
    ) {
      sanitizedMessage = (message as Record<string, unknown>).message as string;
    } else {
      sanitizedMessage = 'Internal server error';
    }

    // Log full error details internally (including stack trace)
    this.logger.error(
      `${request.method} ${request.url} → ${status} | ${exception instanceof Error ? exception.message : 'Unknown error'}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    this.registrarFriccion(request, status, sanitizedMessage);

    // Return sanitized response to client
    response.status(status).json({
      statusCode: status,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private registrarFriccion(request: Request, status: number, mensaje: string): void {
    const user = (request as Request & { user?: { sub?: string; tenantId?: string | null } }).user;
    // 401 = sesión vencida (no es fricción del módulo); los bloqueos de Academy ya se registran en la política.
    if (!this.ds || status < 400 || status === 401 || !user?.tenantId || /Xmart Academy/.test(mensaje)) return;
    const ruta = (request.originalUrl ?? request.url ?? '').split('?')[0];
    const modulo = moduloDeRuta(ruta);
    if (!modulo) return;
    void this.ds
      .query(`INSERT INTO academy_eventos (tenant_id, user_id, modulo, tipo, detalle) VALUES ($1, $2, $3, 'error_api', $4)`, [
        user.tenantId,
        user.sub ?? null,
        modulo,
        JSON.stringify({ ruta: ruta.slice(0, 200), metodo: request.method, status, mensaje: mensaje.slice(0, 300) }),
      ])
      .catch(() => undefined);
  }
}

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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

    // Return sanitized response to client
    response.status(status).json({
      statusCode: status,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

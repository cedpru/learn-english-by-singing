import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly exposeInternalErrors = process.env.NODE_ENV !== 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status: number;
    let message: string | string[] | object;
    let errorCode: string;
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      status = exception.getStatus();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorCode = 'HTTP_EXCEPTION';
      } else {
        const body = exceptionResponse as { message?: string | string[]; errorCode?: string } & Record<
          string,
          unknown
        >;
        message = body.message ?? 'Unexpected error';
        errorCode = body.errorCode ?? 'HTTP_EXCEPTION';
        // Health checks (Terminus) carry { status, info, error, details }.
        if (body.status || body.details) {
          details = body;
        }
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      // Never leak internals (paths, stack frames) in production responses.
      message = this.exposeInternalErrors ? exception.message : 'Internal server error';
      errorCode = 'INTERNAL_SERVER_ERROR';
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Unexpected error occurred';
      errorCode = 'UNKNOWN_ERROR';
    }

    const path = request.originalUrl || request.url;

    if (status >= 500) {
      this.logger.error(
        `Error: ${errorCode} - ${JSON.stringify(message)} - Path: ${path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      errorCode,
      path,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }
}

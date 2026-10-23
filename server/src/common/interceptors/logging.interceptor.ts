import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Global interceptors also run on WebSocket handlers, which have no request.
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, ip } = request;

    // The desktop app polls /health every 3 s: logging it would drown everything.
    if (String(originalUrl).includes('/health')) return next.handle();

    const now = Date.now();
    this.logger.log(`→ ${method} ${originalUrl} - IP: ${ip}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - now;
          this.logger.log(`← ${method} ${originalUrl} - ${responseTime}ms - IP: ${ip}`);
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `✗ ${method} ${originalUrl} - ${error?.status ?? 500} - ${responseTime}ms - IP: ${ip}`,
            error?.stack,
          );
        },
      }),
    );
  }
}

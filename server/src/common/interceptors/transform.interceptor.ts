import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    return next.handle().pipe(
      map((data) => (Array.isArray(data) ? data.map((item) => this.toPlain(item)) : this.toPlain(data))),
    );
  }

  private toPlain(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (Buffer.isBuffer(data)) return data;
    if (typeof data !== 'object') return data;
    // Only class instances need the transformation; plain objects and DTO
    // literals are already JSON-ready and must keep every field.
    const prototype = Object.getPrototypeOf(data);
    if (prototype === Object.prototype || prototype === null) return data;
    return instanceToPlain(data);
  }
}

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

export interface AppSetupOptions {
  apiPrefix: string;
  corsOrigin: string | string[] | false;
}

/** Same HTTP setup for `main.ts` and the e2e tests, so tests hit real routes. */
export function configureApp(app: INestApplication, options: AppSetupOptions): void {
  const { apiPrefix, corsOrigin } = options;

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    // A wildcard origin cannot be combined with credentials.
    credentials: typeof corsOrigin !== 'string' && corsOrigin !== false,
  });

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}

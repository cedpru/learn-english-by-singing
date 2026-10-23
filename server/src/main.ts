import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { NextFunction, raw, Request, Response, static as expressStatic } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

/**
 * The desktop app starts this server as a child process. If the window closes
 * (or crashes), nothing would stop node on Windows: watch the parent and quit
 * as soon as it is gone, so port 8787 is never left busy.
 */
function watchParentProcess(): void {
  const parentPid = Number(process.env.SINGALONG_PARENT_PID);
  if (!Number.isFinite(parentPid) || parentPid <= 0) return;

  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 2000);
  watchdog.unref?.();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = Number(config.get<string>('PORT')) || 8787;
  const apiPrefix = (config.get<string>('API_PREFIX') || '/api').replace(/^\/+|\/+$/g, '') || 'api';
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(compression());

  // Microphone clips are posted as raw binary (`Content-Type: audio/webm` or
  // application/octet-stream); multipart uploads go through FileInterceptor.
  app.use(
    `/${apiPrefix}/recognize`,
    raw({
      limit: MAX_AUDIO_BYTES,
      type: (request) =>
        !String(request.headers['content-type'] ?? '')
          .toLowerCase()
          .startsWith('multipart/'),
    }),
  );

  const configuredOrigins = (config.get<string>('CORS_ORIGIN') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = configuredOrigins.length
    ? configuredOrigins
    : isProduction
      ? false
      : '*';

  configureApp(app, { apiPrefix, corsOrigin });

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Sing Along API')
      .setDescription('API pour la reconnaissance musicale et le karaoké')
      .setVersion('1.0')
      .addServer(`http://localhost:${port}`, 'Local')
      .addTag('Health', 'Health checks')
      .addTag('Recognition', 'Audio recognition')
      .addTag('Lyrics', 'Lyrics retrieval')
      .addTag('Radio', 'Radio streaming')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  // Serve the compiled web app (npm run build) when it exists, with the same
  // SPA fallback the previous Express server had. API routes always win.
  const webDist = path.resolve('dist');
  if (existsSync(webDist)) {
    app.use(expressStatic(webDist));
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.path.startsWith(`/${apiPrefix}/`)) {
        next();
        return;
      }
      response.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');

  logger.log(`🎤 Sing Along API prête sur http://127.0.0.1:${port}/${apiPrefix}`);
  if (!isProduction) {
    logger.log(`📚 Swagger : http://127.0.0.1:${port}/${apiPrefix}/docs`);
  }

  watchParentProcess();
}

void bootstrap();

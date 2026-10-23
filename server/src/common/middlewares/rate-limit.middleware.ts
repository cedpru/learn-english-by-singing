import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RateLimitExceededException } from '../exceptions/custom-exceptions';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly rateLimiter: RateLimiterMemory;
  private readonly recognizeRateLimiter: RateLimiterMemory;

  constructor(private readonly configService: ConfigService) {
    const windowMs = this.configService.get<number>('RATE_LIMIT_WINDOW_MS') || 900_000;
    const maxRequests = this.configService.get<number>('RATE_LIMIT_MAX_REQUESTS') || 600;

    this.rateLimiter = new RateLimiterMemory({
      points: maxRequests,
      duration: Math.max(1, Math.ceil(windowMs / 1000)),
    });

    // Audio recognition is the expensive path (Shazam + ffmpeg): 10 per minute.
    this.recognizeRateLimiter = new RateLimiterMemory({ points: 10, duration: 60 });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const path = req.path || req.originalUrl;

    // The desktop app and the browser poll health constantly: never throttle it,
    // or the app would conclude the server is down.
    if (path.includes('/health') || req.method === 'OPTIONS') {
      next();
      return;
    }

    const limiter = path.includes('/recognize') ? this.recognizeRateLimiter : this.rateLimiter;

    try {
      await limiter.consume(req.ip ?? 'unknown');
      next();
    } catch (error) {
      const msBeforeNext = (error as { msBeforeNext?: number }).msBeforeNext ?? 1000;
      const retryAfter = Math.max(1, Math.ceil(msBeforeNext / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      next(
        new RateLimitExceededException(
          `Trop de requêtes. Réessayez dans ${retryAfter} secondes.`,
          retryAfter,
        ),
      );
    }
  }
}

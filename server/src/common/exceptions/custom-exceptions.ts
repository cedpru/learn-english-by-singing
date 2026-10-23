import { HttpException, HttpStatus } from '@nestjs/common';

export class BadRequestCustomException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super(
      { statusCode: HttpStatus.BAD_REQUEST, message, errorCode: errorCode || 'BAD_REQUEST' },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class NotFoundCustomException extends HttpException {
  constructor(message: string = 'Not found', errorCode?: string) {
    super(
      { statusCode: HttpStatus.NOT_FOUND, message, errorCode: errorCode || 'NOT_FOUND' },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class RateLimitExceededException extends HttpException {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class AudioProcessingException extends HttpException {
  constructor(message: string = 'Audio processing failed', errorCode?: string) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message,
        errorCode: errorCode || 'AUDIO_PROCESSING_FAILED',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class ExternalApiException extends HttpException {
  constructor(
    message: string = 'External API error',
    statusCode: HttpStatus = HttpStatus.BAD_GATEWAY,
    errorCode?: string,
  ) {
    super(
      { statusCode, message, errorCode: errorCode || 'EXTERNAL_API_ERROR' },
      statusCode,
    );
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@sam/domain';

function domainToHttp(err: DomainError): { status: number; type: string } {
  if (err instanceof NotFoundError) return { status: 404, type: 'not_found' };
  if (err instanceof ConflictError) return { status: 409, type: 'conflict' };
  if (err instanceof ValidationError) return { status: 400, type: 'validation_failed' };
  if (err instanceof ForbiddenError) return { status: 403, type: 'forbidden' };
  if (err instanceof UnauthorizedError) return { status: 401, type: 'unauthenticated' };
  return { status: 400, type: err.code.toLowerCase() };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const traceId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal server error';
    let type = 'internal';
    let detail: string | undefined;
    let fields: Record<string, string> | undefined;

    if (exception instanceof DomainError) {
      const mapped = domainToHttp(exception);
      status = mapped.status;
      type = mapped.type;
      title = exception.message;
      detail = exception.message;
      if (exception instanceof ValidationError) fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      title =
        typeof body === 'string'
          ? body
          : ((body as Record<string, string>)['message'] ?? exception.message);
      type = `http_${status}`;
      detail = exception.message;
    } else if (exception instanceof Error) {
      this.log.error(`Unhandled: ${exception.message}`, exception.stack);
      detail = 'An unexpected error occurred';
    }

    res.status(status).json({
      type: `https://errors.smartaccess/${type}`,
      title,
      status,
      ...(detail !== undefined ? { detail } : {}),
      instance: req.path,
      ...(fields !== undefined ? { fields } : {}),
      trace_id: traceId,
    });
  }
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RealtimeGateway } from './realtime/realtime.gateway';

async function bootstrap(): Promise<void> {
  // bodyParser: false so we can register our own json parser that also
  // captures the raw body (needed for Ed25519 request-signature verification).
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });

  // Security headers (HSTS, XSS, frame options, etc.)
  app.use(helmet());

  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready', 'metrics'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Problem+JSON error responses for every exception
  app.useGlobalFilters(new HttpExceptionFilter());

  const doc = new DocumentBuilder()
    .setTitle('Smart Access Middleware API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(process.env['PORT'] ?? 3000);

  // Attach Socket.IO after HTTP server starts
  const gateway = app.get(RealtimeGateway);
  gateway.attach(app.getHttpServer());
}

void bootstrap();

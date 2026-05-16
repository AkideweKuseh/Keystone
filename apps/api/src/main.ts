import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RealtimeGateway } from './realtime/realtime.gateway';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

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

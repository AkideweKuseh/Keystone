import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ReceiverModule } from './receiver.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ReceiverModule, {
    rawBody: true, // needed to access req.rawBody for dedup hash
    logger: ['error', 'warn', 'log'],
  });

  await app.listen(process.env['RECEIVER_PORT'] ?? 3001);
}

void bootstrap();

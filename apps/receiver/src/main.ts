import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({})
class ReceiverModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ReceiverModule);
  await app.listen(process.env['RECEIVER_PORT'] ?? 3001);
}

void bootstrap();

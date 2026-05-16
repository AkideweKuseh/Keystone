import 'reflect-metadata';

function bootstrap(): void {
  // BullMQ worker bootstrap — wired in Phase 2
  process.stdout.write('Worker starting...\n');
}

bootstrap();

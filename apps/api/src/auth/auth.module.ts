import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PasswordService } from '@sam/auth';
import { PrismaService } from '@sam/persistence';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env['JWT_ACCESS_SECRET'] ?? 'dev-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordService, PrismaService],
  exports: [JwtStrategy],
})
export class AuthModule {}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from './jwt.strategy';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

const ROLE_ORDER = ['viewer', 'operator', 'admin', 'owner'];

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<string[] | undefined>(ROLES_KEY, ctx.getHandler()) ?? [];
    if (required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<{ user: JwtPayload }>().user;
    const userLevel = ROLE_ORDER.indexOf(user.role);
    const requiredLevel = Math.min(...required.map((r) => ROLE_ORDER.indexOf(r)));

    if (userLevel < requiredLevel) throw new ForbiddenException();
    return true;
  }
}

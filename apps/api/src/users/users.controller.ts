import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RbacGuard, Roles } from '../auth/rbac.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RbacGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Roles('operator')
  @ApiOperation({ summary: 'Create user and enqueue sync to all devices' })
  create(@Request() req: { user: JwtPayload }, @Body() dto: CreateUserDto) {
    return this.users.create(req.user.tenantId, dto);
  }

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List users' })
  findAll(@Request() req: { user: JwtPayload }, @Query('status') status?: string) {
    return this.users.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.findById(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles('operator')
  @ApiOperation({ summary: 'Update user — increments revision and enqueues re-sync' })
  update(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateUserDto>,
  ) {
    return this.users.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('operator')
  @HttpCode(204)
  @ApiOperation({ summary: 'Terminate user — enqueues removal from all devices' })
  remove(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.terminate(req.user.tenantId, id);
  }

  @Get(':id/sync-status')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get per-device sync status for a user' })
  syncStatus(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.getSyncStatus(req.user.tenantId, id);
  }

  @Post(':id/resync')
  @Roles('operator')
  @HttpCode(202)
  @ApiOperation({ summary: 'Re-enqueue sync for all devices' })
  resync(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.resync(req.user.tenantId, id);
  }
}

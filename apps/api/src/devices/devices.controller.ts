import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DevicesService } from './devices.service';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RbacGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @Roles('operator')
  @ApiOperation({ summary: 'Register a device' })
  create(@Request() req: { user: JwtPayload }, @Body() dto: CreateDeviceDto) {
    return this.devices.create(req.user.tenantId, dto);
  }

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List devices' })
  findAll(
    @Request() req: { user: JwtPayload },
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.devices.findAll(req.user.tenantId, { status, siteId });
  }

  @Get(':id')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get device by ID (includes capabilities)' })
  findOne(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.findById(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles('operator')
  @ApiOperation({ summary: 'Update device' })
  update(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devices.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('operator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete device (sets status=disabled)' })
  remove(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.softDelete(req.user.tenantId, id);
  }

  @Post(':id/unlock')
  @Roles('operator')
  @ApiOperation({ summary: 'Unlock door — synchronous, no queue' })
  unlock(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { door_index?: number },
  ) {
    return this.devices.unlockDoor(req.user.tenantId, id, body.door_index ?? 1);
  }

  @Post(':id/health-check')
  @Roles('operator')
  @ApiOperation({ summary: 'Queue an immediate health check for the device' })
  healthCheck(@Request() req: { user: JwtPayload }, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.enqueueHealthCheck(req.user.tenantId, id);
  }
}

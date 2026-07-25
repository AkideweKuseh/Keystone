import { Body, Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GymSignatureGuard, type SignedRequest } from './gym-signature.guard';
import { IntegrationsService } from './integrations.service';
import { GymMemberDto } from './dto/gym-member.dto';

@ApiTags('Integrations')
@Controller('integrations/gym')
@UseGuards(GymSignatureGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('members')
  @HttpCode(200)
  @ApiOperation({ summary: 'Upsert a gym member (Ed25519-signed, idempotent)' })
  upsert(@Request() req: SignedRequest, @Body() dto: GymMemberDto) {
    const tenantId = req.integration!.tenantId;
    return this.integrations.upsertMember(tenantId, dto);
  }
}

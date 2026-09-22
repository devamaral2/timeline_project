import { Body, Controller, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseRequest } from '../../../http/validation';
import { InspectInviteUseCase } from '../usecases/inspect-invite.usecase';

const inspectBody = z.object({ token: z.string().min(1) }).strict();

@Controller('auth/invites')
export class InspectInviteController {
  constructor(@Inject(InspectInviteUseCase) private readonly inspectInvite: InspectInviteUseCase) {}

  @Post('inspect')
  async execute(@Body() body: unknown) {
    return this.inspectInvite.execute(parseRequest(inspectBody, body).token);
  }
}

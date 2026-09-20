import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedActor } from '../../../domain/users/user';
import { ANONYMOUS_CONTEXT } from '../../../common/request-context';
import { BearerAuthGuard } from '../../../auth-core/security/bearer-auth.guard';
import { CurrentActor } from '../../../auth-core/security/current-actor.decorator';
import { LogoutAllUseCase } from '../usecases/logout-all.usecase';

@Controller('auth')
export class LogoutAllController {
  constructor(@Inject(LogoutAllUseCase) private readonly logoutAll: LogoutAllUseCase) {}

  @Post('logout-all')
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@CurrentActor() actor: AuthenticatedActor, @Req() request: Request): Promise<void> {
    await this.logoutAll.execute({ actor, context: request.context ?? ANONYMOUS_CONTEXT });
  }
}

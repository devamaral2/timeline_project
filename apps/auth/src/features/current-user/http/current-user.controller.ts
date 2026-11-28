import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedActor } from '../../../domain/users/user';
import { BearerAuthGuard } from '../../../nest/bearer-auth.guard';
import { CurrentActor } from '../../../nest/current-actor.decorator';
import { CurrentUserUseCase } from '../usecases/current-user.usecase';

@Controller('auth')
export class CurrentUserController {
  constructor(@Inject(CurrentUserUseCase) private readonly currentUser: CurrentUserUseCase) {}

  @Get('me')
  @UseGuards(BearerAuthGuard)
  async execute(@CurrentActor() actor: AuthenticatedActor) {
    return this.currentUser.execute(actor);
  }
}

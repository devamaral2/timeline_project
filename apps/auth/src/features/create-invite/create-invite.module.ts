import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { Clock } from '../../common/clock';
import { SecretGenerator } from '../../common/secret-generator';
import type { RuntimeEnv } from '../../config/env';
import { RUNTIME_ENV } from '../../config/tokens';
import { PostgresInviteRepository } from '../../auth-core/persistence/postgres-invite.repository';
import { CreateInviteController } from './http/create-invite.controller';
import { CreateInviteUseCase } from './usecases/create-invite.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [CreateInviteController],
  providers: [{
    provide: CreateInviteUseCase,
    inject: [PostgresInviteRepository, Clock, SecretGenerator, RUNTIME_ENV],
    useFactory: (invites: PostgresInviteRepository, clock: Clock, secrets: SecretGenerator, runtime: RuntimeEnv) =>
      new CreateInviteUseCase(invites, clock, secrets, runtime.webAppUrl),
  }],
})
export class CreateInviteModule {}

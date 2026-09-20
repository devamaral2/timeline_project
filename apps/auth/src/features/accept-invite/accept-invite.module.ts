import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { Clock } from '../../common/clock';
import { PreparePassword } from '../../auth-core/password/prepare-password';
import { PostgresInviteRepository } from '../../auth-core/persistence/postgres-invite.repository';
import { AcceptInviteController } from './http/accept-invite.controller';
import { AcceptInviteUseCase } from './usecases/accept-invite.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [AcceptInviteController],
  providers: [{
    provide: AcceptInviteUseCase,
    inject: [PostgresInviteRepository, PreparePassword, Clock],
    useFactory: (invites: PostgresInviteRepository, prepare: PreparePassword, clock: Clock) => new AcceptInviteUseCase(invites, prepare, clock),
  }],
})
export class AcceptInviteModule {}

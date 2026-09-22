import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { Clock } from '../../common/clock';
import { PostgresInviteRepository } from '../../auth-core/persistence/postgres-invite.repository';
import { InspectInviteController } from './http/inspect-invite.controller';
import { InspectInviteUseCase } from './usecases/inspect-invite.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [InspectInviteController],
  providers: [{
    provide: InspectInviteUseCase,
    inject: [PostgresInviteRepository, Clock],
    useFactory: (invites: PostgresInviteRepository, clock: Clock) => new InspectInviteUseCase(invites, clock),
  }],
})
export class InspectInviteModule {}

import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { Clock } from '../../common/clock';
import { PostgresSessionRepository } from '../../auth-core/persistence/postgres-session.repository';
import { LogoutAllController } from './http/logout-all.controller';
import { LogoutAllUseCase } from './usecases/logout-all.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [LogoutAllController],
  providers: [{
    provide: LogoutAllUseCase,
    inject: [PostgresSessionRepository, Clock],
    useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new LogoutAllUseCase(sessions, clock),
  }],
})
export class LogoutAllModule {}

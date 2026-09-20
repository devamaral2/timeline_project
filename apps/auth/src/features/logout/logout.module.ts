import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { Clock } from '../../common/clock';
import { PostgresSessionRepository } from '../../auth-core/persistence/postgres-session.repository';
import { LogoutController } from './http/logout.controller';
import { LogoutUseCase } from './usecases/logout.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [LogoutController],
  providers: [{
    provide: LogoutUseCase,
    inject: [PostgresSessionRepository, Clock],
    useFactory: (sessions: PostgresSessionRepository, clock: Clock) => new LogoutUseCase(sessions, clock),
  }],
})
export class LogoutModule {}

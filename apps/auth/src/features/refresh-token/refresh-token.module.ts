import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { Clock } from '../../common/clock';
import { SecretGenerator } from '../../common/secret-generator';
import { SigningKeyService } from '../../auth-core/security/signing-key.service';
import { PostgresSessionRepository } from '../../auth-core/persistence/postgres-session.repository';
import { RefreshTokenController } from './http/refresh-token.controller';
import { RefreshTokenUseCase } from './usecases/refresh-token.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [RefreshTokenController],
  providers: [{
    provide: RefreshTokenUseCase,
    inject: [PostgresSessionRepository, SigningKeyService, Clock, SecretGenerator],
    useFactory: (sessions: PostgresSessionRepository, keys: SigningKeyService, clock: Clock, secrets: SecretGenerator) =>
      new RefreshTokenUseCase(sessions, keys.signAccessToken, clock, secrets),
  }],
})
export class RefreshTokenModule {}

import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { AuthorizationService } from '../../auth-core/security/authorization.service';
import { CurrentUserController } from './http/current-user.controller';
import { CurrentUserUseCase } from './usecases/current-user.usecase';

@Module({
  imports: [AuthCoreModule],
  controllers: [CurrentUserController],
  providers: [{
    provide: CurrentUserUseCase,
    inject: [AuthorizationService],
    useFactory: (authorization: AuthorizationService) => new CurrentUserUseCase(authorization),
  }],
})
export class CurrentUserModule {}

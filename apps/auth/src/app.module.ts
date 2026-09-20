import { Module, type DynamicModule } from '@nestjs/common';
import type { RuntimeEnv } from './config/env';
import { AuthCoreModule } from './auth-core/auth-core.module';
import { HttpModule } from './http/http.module';
import { ApiProxyModule } from './http/api-proxy/api-proxy.module';
import { LoginWithPasswordModule } from './features/login-with-password/login-with-password.module';
import { RefreshTokenModule } from './features/refresh-token/refresh-token.module';
import { LogoutModule } from './features/logout/logout.module';
import { LogoutAllModule } from './features/logout-all/logout-all.module';
import { CurrentUserModule } from './features/current-user/current-user.module';
import { InspectInviteModule } from './features/inspect-invite/inspect-invite.module';
import { AcceptInviteModule } from './features/accept-invite/accept-invite.module';
import { CreateInviteModule } from './features/create-invite/create-invite.module';

@Module({})
export class AppModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AuthCoreModule.forRoot(env),
        HttpModule,
        ApiProxyModule,
        LoginWithPasswordModule,
        RefreshTokenModule,
        LogoutModule,
        LogoutAllModule,
        CurrentUserModule,
        InspectInviteModule,
        AcceptInviteModule,
        CreateInviteModule,
      ],
    };
  }
}

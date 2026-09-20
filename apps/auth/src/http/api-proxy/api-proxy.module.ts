import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { RuntimeEnv } from '../../config/env';
import { RUNTIME_ENV } from '../../config/tokens';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayProxy } from './api-gateway.proxy';

@Module({
  imports: [AuthCoreModule],
  controllers: [ApiGatewayController],
  providers: [{
    provide: ApiGatewayProxy,
    inject: [HttpAdapterHost, RUNTIME_ENV],
    useFactory: (adapterHost: HttpAdapterHost, runtime: RuntimeEnv) =>
      new ApiGatewayProxy(() => adapterHost.httpAdapter.getHttpServer(), runtime.apiServiceUrl),
  }],
})
export class ApiProxyModule {}

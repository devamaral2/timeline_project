import { Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { RuntimeEnv } from '../../config/env';
import { RUNTIME_ENV } from '../../config/tokens';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { DeviceGatewayController } from './device-gateway.controller';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayProxyLifecycle } from '../../nest/api-gateway.lifecycle';

@Module({
  imports: [AuthCoreModule],
  // A ordem importa: a rota da chave de dispositivo vem antes do `api/*path` geral.
  controllers: [DeviceGatewayController, ApiGatewayController],
  providers: [{
    provide: ApiGatewayProxyLifecycle,
    inject: [HttpAdapterHost, RUNTIME_ENV],
    useFactory: (adapterHost: HttpAdapterHost, runtime: RuntimeEnv) =>
      new ApiGatewayProxyLifecycle(() => adapterHost.httpAdapter.getHttpServer(), runtime.apiServiceUrl),
  }],
})
export class ApiProxyModule {}

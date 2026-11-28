import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../auth-core/auth-core.module';
import { DeviceGatewayController } from './device-gateway.controller';
import { ApiGatewayController } from './api-gateway.controller';

/**
 * As rotas de proxy continuam no Nest temporariamente. O listener de upgrade
 * do WebSocket não mora aqui: o composition root o instala e remove no
 * servidor Fastify, fora dos hooks de lifecycle do Nest.
 */
@Module({
  imports: [AuthCoreModule],
  // A ordem importa: a rota da chave de dispositivo vem antes do `api/*path` geral.
  controllers: [DeviceGatewayController, ApiGatewayController],
})
export class ApiProxyModule {}

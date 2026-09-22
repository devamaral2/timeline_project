import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { HealthController } from './health.controller';
import { JwksController } from './jwks.controller';

@Module({
  imports: [AuthCoreModule],
  controllers: [HealthController, JwksController],
})
export class HttpModule {}

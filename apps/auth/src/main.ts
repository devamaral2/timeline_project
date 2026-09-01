import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getRuntimeEnv } from './config/env';
import { findMonorepoRoot, loadRootEnv } from './config/load-env';
import { configureHttpShell } from './http/request-context.middleware';
import { SigningKeyService } from './crypto/signing-key.service';
import { ANONYMOUS_CONTEXT } from './common/request-context';

async function bootstrap(): Promise<void> {
  const env = getRuntimeEnv(
    loadRootEnv(findMonorepoRoot(__dirname), process.env),
  );
  const app = await NestFactory.create(AppModule.forRoot(env), {
    bodyParser: false,
  });
  configureHttpShell(app);
  await app.get(SigningKeyService).ensureActive(new Date(), {
    correlationId: 'startup',
    actorUserId: null,
    action: 'key.created',
    targetType: 'signing_key',
    targetId: null,
    result: 'succeeded',
    reason: null,
    metadata: {},
    context: ANONYMOUS_CONTEXT,
    occurredAt: new Date(),
  });
  await app.listen(env.port, env.host);
  Logger.log(`Auth listening on http://${env.host}:${env.port}`, 'Bootstrap');
}

void bootstrap();

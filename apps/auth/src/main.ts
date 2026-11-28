import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getRuntimeEnv } from './config/env';
import { findMonorepoRoot, loadRootEnv } from './config/load-env';
import { configureHttpShell } from './nest/http-shell';
import { configureApiDocumentation } from './nest/api-documentation';
import { SigningKeyService } from './auth-core/security/signing-key.service';
import { ensureSigningKeyActive } from './bootstrap/signing-key-startup';

async function bootstrap(): Promise<void> {
  const env = getRuntimeEnv(
    loadRootEnv(findMonorepoRoot(__dirname), process.env),
  );
  const app = await NestFactory.create(AppModule.forRoot(env), {
    bodyParser: false,
  });
  configureHttpShell(app);
  configureApiDocumentation(app);
  await ensureSigningKeyActive(app.get(SigningKeyService));
  await app.listen(env.port, env.host);
  Logger.log(`Auth listening on http://${env.host}:${env.port}`, 'Bootstrap');
}

void bootstrap();

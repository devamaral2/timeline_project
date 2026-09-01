import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getRuntimeEnv } from "./config/env";
import { loadRootEnv } from "./config/load-env";
import { configureHttpShell } from "./http/request-context.middleware";

async function bootstrap(): Promise<void> {
  const env = getRuntimeEnv(loadRootEnv(process.cwd(), process.env));
  const app = await NestFactory.create(AppModule.forRoot(env), { bodyParser: false });
  configureHttpShell(app);
  await app.listen(env.port, env.host);
  Logger.log(`Auth listening on http://${env.host}:${env.port}`, "Bootstrap");
}

void bootstrap();

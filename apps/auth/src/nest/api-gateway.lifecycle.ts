import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import type { Server } from "node:http";
import { ApiUpgradeProxy } from "../http/api-proxy/api-upgrade-proxy";

/**
 * Adaptador temporario do lifecycle Nest: instala e remove o listener de
 * upgrade do Auth. O proxy em si vive em `http/api-proxy/api-upgrade-proxy.ts`.
 */
@Injectable()
export class ApiGatewayProxyLifecycle implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(ApiGatewayProxyLifecycle.name);
  private readonly proxy: ApiUpgradeProxy;

  constructor(
    private readonly server: () => Server,
    apiServiceUrl: string,
  ) {
    this.proxy = new ApiUpgradeProxy(apiServiceUrl, this.logger);
  }

  onApplicationBootstrap(): void {
    this.proxy.attach(this.server());
  }

  beforeApplicationShutdown(): void {
    this.proxy.detach(this.server());
  }
}

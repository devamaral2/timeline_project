import { Inject, Injectable, Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { getJobsEnv } from "../config/env";
import { PersistenceModule } from "./persistence.module";
import { DATABASE } from "../infrastructure/persistence/tokens";
import { PostgresDatabase } from "../infrastructure/persistence/database/postgres-database";
import { PostgresJobStore } from "../infrastructure/persistence/jobs/postgres-job.store";
import { JobsService } from "../infrastructure/jobs/jobs.service";

/** Adaptador do lifecycle antigo: o worker tem `start`/`shutdown` explicitos. */
@Injectable()
export class JobsLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  onModuleInit(): void {
    this.jobs.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.jobs.shutdown();
  }
}

@Module({
  imports: [PersistenceModule],
  providers: [{
    provide: JobsService,
    inject: [DATABASE],
    useFactory: (database: PostgresDatabase) => {
      const env = getJobsEnv();
      return new JobsService(new PostgresJobStore(database, env.AI_JOBS_LEASE_MS, env.AI_JOBS_MAX_ATTEMPTS), env);
    },
  }, JobsLifecycle],
  exports: [JobsService],
})
export class JobsModule {}

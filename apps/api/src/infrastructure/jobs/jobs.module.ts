import { Module } from "@nestjs/common";
import { getJobsEnv } from "../../config/env";
import { DATABASE, PersistenceModule } from "../persistence/persistence.module";
import { PostgresDatabase } from "../persistence/database/postgres-database";
import { PostgresJobStore } from "../persistence/jobs/postgres-job.store";
import { JobsService } from "./jobs.service";

@Module({
  imports: [PersistenceModule],
  providers: [{
    provide: JobsService,
    inject: [DATABASE],
    useFactory: (database: PostgresDatabase) => {
      const env = getJobsEnv();
      return new JobsService(new PostgresJobStore(database, env.AI_JOBS_LEASE_MS, env.AI_JOBS_MAX_ATTEMPTS), env);
    },
  }],
  exports: [JobsService],
})
export class JobsModule {}

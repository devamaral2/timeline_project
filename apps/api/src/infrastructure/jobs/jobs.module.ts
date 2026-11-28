import { Module } from "@nestjs/common";
import { getJobsEnv } from "../../config/env";
import { DATABASE, PersistenceModule } from "../persistence/persistence.module";
import type { SqliteDatabase } from "@repo/sqlite";
import { SqliteJobStore } from "../persistence/jobs/sqlite-job.store";
import { JobsService } from "./jobs.service";

@Module({
  imports: [PersistenceModule],
  providers: [{
    provide: JobsService,
    inject: [DATABASE],
    useFactory: (database: SqliteDatabase) => {
      const env = getJobsEnv();
      return new JobsService(new SqliteJobStore(database, env.AI_JOBS_LEASE_MS, env.AI_JOBS_MAX_ATTEMPTS), env);
    },
  }],
  exports: [JobsService],
})
export class JobsModule {}

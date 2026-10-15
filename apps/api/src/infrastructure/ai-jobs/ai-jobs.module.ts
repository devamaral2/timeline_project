import { Module } from "@nestjs/common";
import { getAiJobsEnv } from "../../config/env";
import { DATABASE, PersistenceModule } from "../persistence/persistence.module";
import { PostgresDatabase } from "../persistence/database/postgres-database";
import { PostgresAiJobStore } from "../persistence/ai-jobs/postgres-ai-job.store";
import { AiJobsService } from "./ai-jobs.service";

@Module({
  imports: [PersistenceModule],
  providers: [{
    provide: AiJobsService,
    inject: [DATABASE],
    useFactory: (database: PostgresDatabase) => {
      const env = getAiJobsEnv();
      return new AiJobsService(new PostgresAiJobStore(database, env.AI_JOBS_LEASE_MS, env.AI_JOBS_MAX_ATTEMPTS), env);
    },
  }],
  exports: [AiJobsService],
})
export class AiJobsModule {}

import { loadRootEnv } from "../config/load-env";
import { getRuntimeEnv } from "../config/env";
import { createAuthDatabase } from "../db/client";
import { PostgresInviteRepository } from "../invites/postgres-invite.repository";
import { BootstrapAdminUseCase } from "../invites/usecases/bootstrap-admin.usecase";
import { SystemClock } from "../common/clock";
import { CryptoSecretGenerator } from "../common/secret-generator";
import { inviteLink } from "../invites/invite";
function args(values:string[]){ const result:Record<string,string>={}; for(let i=0;i<values.length;i+=2){const key=values[i]; if((key!=="--email"&&key!=="--name")||!values[i+1]||result[key]) throw new Error("usage: bootstrap-admin --email EMAIL --name NAME"); result[key]=values[i+1];} if(Object.keys(result).length!==2) throw new Error("usage: bootstrap-admin --email EMAIL --name NAME"); return result; }
async function main(){ const a=args(process.argv.slice(2)), env=getRuntimeEnv(loadRootEnv(process.cwd(), process.env)), db=createAuthDatabase({connectionString:env.databaseUrl}); try {const result=await new BootstrapAdminUseCase(new PostgresInviteRepository(db),new SystemClock(),new CryptoSecretGenerator()).execute({email:a["--email"],name:a["--name"],context:{correlationId:"cli",ipAddress:null,userAgent:null}}); if(result.kind!=="created"&&result.kind!=="reissued") throw new Error(result.kind); process.stdout.write(`userId=${result.userId}\ninvite=${inviteLink(env.webAppUrl,result.inviteToken)}\n`);} finally {await db.close();} }
void main().catch(()=>{process.exitCode=1;});

import { createParamDecorator, type ExecutionContext } from "@nestjs/common"; export const CurrentActor=createParamDecorator((_d:unknown,c:ExecutionContext)=>c.switchToHttp().getRequest().actor);

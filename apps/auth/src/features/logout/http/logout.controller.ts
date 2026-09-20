import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ANONYMOUS_CONTEXT } from '../../../common/request-context';
import { parseRequest } from '../../../http/validation';
import { LogoutUseCase } from '../usecases/logout.usecase';

const refreshTokenBody = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();

@Controller('auth')
export class LogoutController {
  constructor(@Inject(LogoutUseCase) private readonly logout: LogoutUseCase) {}

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async execute(@Body() body: unknown, @Req() request: Request): Promise<void> {
    const value = parseRequest(refreshTokenBody, body);
    await this.logout.execute({ refreshToken: value.refreshToken, context: request.context ?? ANONYMOUS_CONTEXT });
  }
}

import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ANONYMOUS_CONTEXT } from '../../../common/request-context';
import { parseRequest } from '../../../http/validation';
import { RefreshTokenUseCase } from '../usecases/refresh-token.usecase';

const refreshTokenBody = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();

@Controller('auth')
export class RefreshTokenController {
  constructor(@Inject(RefreshTokenUseCase) private readonly refreshToken: RefreshTokenUseCase) {}

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown, @Req() request: Request) {
    const value = parseRequest(refreshTokenBody, body);
    const result = await this.refreshToken.execute({ refreshToken: value.refreshToken, context: request.context ?? ANONYMOUS_CONTEXT });
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }
}

import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { SigningKeyService } from '../crypto/signing-key.service';

@Controller('.well-known')
export class JwksController {
  constructor(
    @Inject(SigningKeyService) private readonly keys: SigningKeyService,
  ) {}
  @Get('jwks.json')
  async jwks(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const body = JSON.stringify(this.keys.publicJwks());
    const etag = `"sha256-${createHash('sha256').update(body).digest('base64url')}"`;
    response.setHeader(
      'Cache-Control',
      'public, max-age=300, stale-if-error=3600',
    );
    response.setHeader('ETag', etag);
    if (ifNoneMatch === etag) {
      response.status(304).end();
      return;
    }
    response.type('application/json').send(body);
  }
}

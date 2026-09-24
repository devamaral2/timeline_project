import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  Inject,
  Module,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiCoreModule } from '../../api-core/api-core.module';
import { CurrentUser } from '../../http/request-identity/current-user.decorator';
import { GatewayIdentityGuard } from '../../http/request-identity/gateway-identity.guard';
import type { AuthenticatedUser } from '../../http/request-identity/authenticated-user';
import { readAudioBody } from './audio-body';
import { TranscriptionGateway } from './transcription.gateway';

function recordingId(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new HttpException('Invalid recording ID', 400);
  return parsed.data.toLowerCase();
}

@Controller('api/audio/transcriptions')
@UseGuards(GatewayIdentityGuard)
export class TranscribeAudioController {
  constructor(
    @Inject(TranscriptionGateway)
    private readonly gateway: TranscriptionGateway,
  ) {}

  @Get('capabilities')
  @Header('Cache-Control', 'no-store')
  capabilities() {
    return { enabled: this.gateway.enabled };
  }

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async upload(
    @Req() request: Request,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!this.gateway.enabled)
      throw new HttpException('Transcription is unavailable', 503);
    const id = recordingId(request.headers['x-recording-id']);
    const audio = await readAudioBody(request);
    return this.gateway.request(
      actor.userId,
      id,
      'POST',
      audio,
      request.headers['content-type'],
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.gateway.request(actor.userId, recordingId(id), 'GET');
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.gateway.request(actor.userId, recordingId(id), 'DELETE');
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [TranscribeAudioController],
  providers: [
    {
      provide: TranscriptionGateway,
      useFactory: () => new TranscriptionGateway(),
    },
  ],
})
export class TranscribeAudioModule {}

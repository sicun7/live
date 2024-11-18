import { Module } from '@nestjs/common';
import { StreamGateway } from './stream/stream.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [StreamGateway],
})
export class AppModule {} 
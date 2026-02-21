import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { SessionService } from './session.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [EventsService, SessionService],
  exports: [EventsService, SessionService],
})
export class EventsModule {}

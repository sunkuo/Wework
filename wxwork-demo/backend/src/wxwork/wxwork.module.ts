import { Module } from '@nestjs/common';
import { WxWorkController } from './wxwork.controller';
import { WxWorkService } from './wxwork.service';
import { EventsModule } from '../events/events.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [EventsModule, ConfigModule],
  controllers: [WxWorkController],
  providers: [WxWorkService],
  exports: [WxWorkService],
})
export class WxWorkModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { FlightScheduleParser } from './parser/flight-schedule.parser';

@Module({
  controllers: [AppController],
  providers: [FlightScheduleParser],
})
export class AppModule {}

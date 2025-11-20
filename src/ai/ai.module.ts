import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

@Module({
  providers: [AiService],
  exports: [AiService], // hogy a CsvModule használhassa
})
export class AiModule {}

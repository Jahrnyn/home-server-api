import { Module } from '@nestjs/common';
import { CsvController } from './csv.controller';
import { CsvService } from './csv.service';
import { CsvEngineService } from './csv-engine.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [CsvController],
  providers: [CsvService, CsvEngineService],
})
export class CsvModule {}

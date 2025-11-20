import { Body, Controller, Post } from '@nestjs/common';
import { CsvService } from './csv.service';
import { AnalyzeCsvDto } from './dto/analyze-csv.dto';
import { AnalyzeCsvResponse } from './models/analyze-csv-response.model';
import { CleanCsvDto } from './dto/clean-csv.dto';
import { CleanCsvResponse } from './models/clean-csv-response.model';

@Controller('csv')
export class CsvController {
  constructor(private readonly csvService: CsvService) {}

  @Post('analyze')
  analyzeCsv(@Body() dto: AnalyzeCsvDto): Promise<AnalyzeCsvResponse> {
    return this.csvService.analyzeCsv(dto);
  }

  @Post('clean')
  cleanCsv(@Body() dto: CleanCsvDto): Promise<CleanCsvResponse> {
    return this.csvService.cleanCsv(dto);
  }
}

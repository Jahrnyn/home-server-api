import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AnalyzeCsvDto {
  @IsString()
  @IsNotEmpty()
  csvSample: string;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsOptional()
  @IsBoolean()
  hasHeader?: boolean;
}

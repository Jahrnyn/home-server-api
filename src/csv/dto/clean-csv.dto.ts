import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CleanCsvDto {
  @IsString()
  @IsNotEmpty()
  csv: string;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsOptional()
  @IsBoolean()
  hasHeader?: boolean;
}

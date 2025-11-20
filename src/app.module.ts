import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CsvModule } from './csv/csv.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    // .env kezelés (AI_AGENT_URL, AI_MODEL stb.)
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CsvModule,
    AiModule,
  ],
})
export class AppModule {}

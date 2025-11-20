import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AnalyzeCsvDto } from './dto/analyze-csv.dto';
import { CleanCsvDto } from './dto/clean-csv.dto';
import {
  AnalyzeCsvAction,
  AnalyzeCsvResponse,
} from './models/analyze-csv-response.model';
import {
  CleanCsvResponse,
  CleanStats,
} from './models/clean-csv-response.model';
import { AiReview } from './models/ai-review.model';
import { CsvEngineService } from './csv-engine.service';

// ---- RAW AI típusok (amit az LLM visszaküldhet) ----

type AiRawAction = {
  type?: unknown;
  column_index?: unknown; // snake_case verzió
  columnIndex?: unknown; // camelCase verzió
};

type AiRawResponse = {
  explanation?: unknown;
  issues?: unknown;
  actions?: unknown;
};

@Injectable()
export class CsvService {
  private readonly logger = new Logger(CsvService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly csvEngine: CsvEngineService,
  ) {}

  /**
   * AI-alapú elemzés: kap egy CSV mintát és metaadatokat,
   * meghívja az AI-t, JSON-t vár, parse-olja és minimálisan validálja,
   * majd visszaad egy AnalyzeCsvResponse struktúrát.
   */
  async analyzeCsv(dto: AnalyzeCsvDto): Promise<AnalyzeCsvResponse> {
    const raw = await this.aiService.analyzeCsvPrompt(dto);

    // 1) Kivágjuk az első JSON blokkot az AI válaszból (ha dumálna is körülötte)
    const jsonString = this.extractJsonBlock(raw);

    // 1/b) Gyors "fertőtlenítés":
    // - az AI néha JSON-ban is használ \', ami szabvány szerint érvénytelen,
    //   ezért ezeket sima aposztrófra cseréljük.
    const sanitizedJsonString = jsonString.replace(/\\'/g, "'");

    // 2) JSON.parse + minimal type guard
    let parsed: unknown;
    try {
      parsed = JSON.parse(sanitizedJsonString);
    } catch {
      this.logger.error(`Failed to parse AI JSON: ${sanitizedJsonString}`);
      throw new BadRequestException(
        'AI did not return valid JSON. Try again or adjust the prompt.',
      );
    }

    if (!this.isValidAiResponse(parsed)) {
      this.logger.error(
        `AI JSON missing required fields: ${JSON.stringify(parsed)}`,
      );
      throw new BadRequestException(
        'AI response missing required fields (explanation, issues, actions).',
      );
    }

    // innen parsed már { explanation: string; issues: unknown[]; actions: unknown[] } típusú
    const issues = parsed.issues.map((i: unknown) => String(i));

    const actions: AnalyzeCsvAction[] = parsed.actions.map(
      (a: unknown): AnalyzeCsvAction => {
        const action = a as AiRawAction;

        let type: string;

        if (typeof action.type === 'string') {
          type = action.type;
        } else if (
          typeof action.type === 'number' ||
          typeof action.type === 'boolean'
        ) {
          type = String(action.type);
        } else {
          type = 'unknown';
        }

        let columnIndex: number | undefined;
        if (typeof action.column_index === 'number') {
          columnIndex = action.column_index;
        } else if (typeof action.columnIndex === 'number') {
          columnIndex = action.columnIndex;
        }

        return {
          type,
          columnIndex,
        };
      },
    );

    const response: AnalyzeCsvResponse = {
      explanation: parsed.explanation,
      issues,
      actions,
    };

    return response;
  }

  /**
   * Teljes CSV-tisztítás:
   * - AI-tól kér egy tisztítási tervet egy mintára (analyzeCsv újrahasznosítása)
   * - parse-olja a TELJES CSV-t (CsvEngineService)
   * - CleaningAction-ökké alakítja az AI action listát (CsvEngineService)
   * - lefuttatja a tisztító lépéseket (CsvEngineService)
   * - statisztikát számol
   * - visszaadja az AiReview-t, stats-ot és a cleanedCsv-t
   */
  async cleanCsv(dto: CleanCsvDto): Promise<CleanCsvResponse> {
    const delimiter = dto.delimiter ?? ',';
    const hasHeader = dto.hasHeader ?? true;

    // 0) Eredeti sorok (stat-ok miatt)
    const originalRows = this.csvEngine.parseCsv(dto.csv, delimiter);
    const rowsBefore = originalRows.length;
    const columns = rowsBefore > 0 ? originalRows[0].length : 0;

    // 1) PRE-CLEAN: kézi, determinisztikus tisztítás – AI nélkül
    // Itt mi döntjük el, mi legyen az a minimál készlet, amit MINDIG lefuttatunk.
    const preCleanActions = [
      { type: 'STRIP_WRAPPING_QUOTES' as const },
      { type: 'TRIM_WHITESPACE' as const },
      { type: 'REMOVE_EMPTY_ROWS' as const },
      {
        type: 'ENSURE_EQUAL_COLUMNS' as const,
        mode: 'pad-with-empty' as const,
      },
    ];

    const {
      rows: preCleanedRows,
      rowsChanged: preChanged,
      rowsDropped: preDropped,
    } = this.csvEngine.applyActions(originalRows, preCleanActions, hasHeader);

    // 2) Ebből a PRE-CLEANED CSV-ből készítünk mintát az AI-nak
    const preCleanedCsv = this.csvEngine.serializeCsv(
      preCleanedRows,
      delimiter,
    );
    const sample = this.csvEngine.buildSample(preCleanedCsv);

    // 3) AI terv kérés a mintára – újrahasznosítjuk az analyzeCsv logikát
    const analyzeDto: AnalyzeCsvDto = {
      csvSample: sample,
      delimiter,
      hasHeader,
    };

    this.logger.log('CLEAN_CSV: calling analyzeCsv (AI)...');

    const plan = await this.analyzeCsv(analyzeDto); // explanation + issues + actions[]

    this.logger.log('CLEAN_CSV: analyzeCsv (AI) finished OK.');

    // 4) AI review objektum – frontendnek
    const aiReview: AiReview = {
      explanation: plan.explanation,
      issues: plan.issues,
      actions: plan.actions,
    };

    // 5) AI által javasolt actionök leképezése típusos CleaningAction-tömbbé
    const aiCleaningActions = this.csvEngine.mapToCleaningActions(plan.actions);

    // 6) AI action-ök alkalmazása a PRE-CLEANED sorokra
    const {
      rows: finalRows,
      rowsChanged: aiChanged,
      rowsDropped: aiDropped,
    } = this.csvEngine.applyActions(
      preCleanedRows,
      aiCleaningActions,
      hasHeader,
    );

    const rowsAfter = finalRows.length;

    const stats: CleanStats = {
      rowsBefore,
      rowsAfter,
      columns,
      rowsChanged: preChanged + aiChanged,
      rowsDropped: preDropped + aiDropped,
    };

    const cleanedCsv = this.csvEngine.serializeCsv(finalRows, delimiter);

    const response: CleanCsvResponse = {
      aiReview,
      stats,
      cleanedCsv,
    };

    return response;
  }

  // ---------------------------------------------------------------------------
  // ----------------------- PRIVÁT HELPER FÜGGVÉNYEK -------------------------
  // ---------------------------------------------------------------------------

  /**
   * Megpróbálja kivágni az első JSON blokkot a nyers AI válaszból.
   * Keres egy '{' kezdetet és az ahhoz tartozó '}' zárójelet.
   */
  private extractJsonBlock(raw: string): string {
    // ha a modell véletlenül tényleg csak tiszta JSON-t adott
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      this.logger.error(`No JSON object found in AI response: ${raw}`);
      throw new BadRequestException(
        'AI response does not contain a JSON object.',
      );
    }

    const jsonCandidate = raw.slice(firstBrace, lastBrace + 1).trim();
    return jsonCandidate;
  }

  /**
   * Type guard: ellenőrizzük, hogy explanation string, issues/actions tömbök.
   * Ha ez igaz, a hívó oldalon a value már:
   * { explanation: string; issues: unknown[]; actions: unknown[] } típusú lesz.
   */
  private isValidAiResponse(value: unknown): value is {
    explanation: string;
    issues: unknown[];
    actions: unknown[];
  } {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const obj = value as AiRawResponse;

    if (typeof obj.explanation !== 'string') {
      return false;
    }

    if (!Array.isArray(obj.issues)) {
      return false;
    }

    if (!Array.isArray(obj.actions)) {
      return false;
    }

    return true;
  }
}

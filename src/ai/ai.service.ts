import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

/**
 * Bemeneti DTO az AI számára.
 * A Nest cleanCsv() mindig egy PRE-CLEANED mintát ad,
 * ami egy (általában 50 sor alatti) CSV részlet.
 */
interface AnalyzeCsvPromptInput {
  csvSample: string;
  delimiter?: string;
  hasHeader?: boolean;
}

/**
 * Az Ollama /v1/chat/completions válaszának minimálisan
 * használt részhalmaza.
 */
interface AiChatCompletionResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl: string;
  private readonly model: string;

  constructor() {
    // AI hívás URL-je – ha nincs env, fallback a lokális Ollama endpointra.
    this.apiUrl =
      process.env.AI_AGENT_URL ?? 'http://127.0.0.1:11434/v1/chat/completions';

    // Használt modell – env-ből állítható, különben llama3.2:1b.
    this.model = process.env.AI_MODEL ?? 'llama3.2:1b';

    this.logger.log(`AI SERVICE INIT: url=${this.apiUrl}, model=${this.model}`);
  }

  /**
   * Fő publikus metódus:
   * - felépíti a system + user promptot,
   * - meghívja az Ollama chat completions endpointot,
   * - visszaadja a nyers content stringet (amit majd a CsvService parse-ol).
   */
  async analyzeCsvPrompt(input: AnalyzeCsvPromptInput): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input);

    this.logger.log(
      `AI: calling agent: url=${this.apiUrl}, model=${this.model}`,
    );

    try {
      const { data } = await axios.post<AiChatCompletionResponse>(
        this.apiUrl,
        {
          model: this.model,
          temperature: 0,
          max_tokens: 512,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        },
        { timeout: 15000 },
      );

      this.logger.log('AI: response received from agent');

      // Az Ollama /v1/chat/completions válasza: { choices: [ { message: { content: "..." } } ] }
      const content = data.choices?.[0]?.message?.content;

      if (!content || typeof content !== 'string') {
        this.logger.error(
          `AI response has no content or non-string content. Raw data: ${JSON.stringify(
            data,
          ).substring(0, 500)}...`,
        );
        throw new Error('AI returned empty or invalid content.');
      }

      return content.trim();
    } catch (error: unknown) {
      // 1) Axios-specifikus hiba
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        const status = axiosError.response?.status;
        const body = axiosError.response?.data;
        const code = axiosError.code;

        this.logger.error(
          `AI AXIOS ERROR: message="${axiosError.message}", code="${code}", status=${status}`,
        );

        // 2) A response body-ból első 500 karakter:
        if (body !== undefined) {
          try {
            this.logger.error(
              `AI AXIOS RESPONSE BODY: ${JSON.stringify(body).substring(
                0,
                500,
              )}...`,
            );
          } catch {
            this.logger.error(
              `AI AXIOS RESPONSE BODY (non-JSON, type=${typeof body})`,
            );
          }
        }

        // 3) plusz egy direkt console.error, hogy biztosan bekerüljön a journald-ba
        console.error(
          'AI-DEBUG-AXIOS:',
          axiosError.message,
          'code=',
          code,
          'status=',
          status,
        );
      } else if (error instanceof Error) {
        // 2) Nem-Axios Error
        this.logger.error(`AI NON-AXIOS ERROR: ${error.message}`);
        console.error('AI-DEBUG-NON-AXIOS:', error.message);
      } else {
        // 3) Valami teljesen ismeretlen
        this.logger.error(`AI UNKNOWN ERROR TYPE: ${String(error)}`);
        console.error('AI-DEBUG-UNKNOWN:', String(error));
      }

      // továbbdobjuk, hogy a Nest 500-at adjon vissza
      throw error instanceof Error
        ? error
        : new Error('Unknown error calling AI agent');
    }
  }

  /**
   * SYSTEM PROMPT
   *
   * Itt mondjuk meg az LLM-nek, hogy:
   * - PRE-CLEANED CSV mintát kap (Nest már egyszer takarított),
   * - a feladata, hogy MINDEN strukturális vagy egyszerű data-quality
   *   problémát találjon,
   * - és kizárólag egy JSON objektumot adjon vissza
   *   { explanation, issues[], actions[] } formában.
   *
   * Az action lista FORMÁTUMA illeszkedik a CsvService elvárásaihoz:
   * - "type": string (fix készletből),
   * - "column_index": csak akkor kötelező, ha COERCE_NUMERIC-et ad,
   *   és 0-alapú indexet használ.
   */
  private buildSystemPrompt(): string {
    return `
You are a STRICT CSV analysis engine.

The CSV sample you see has ALREADY gone through one deterministic cleaning pass
(e.g. basic whitespace trimming). Now your job is to look for ANY remaining
STRUCTURAL or SIMPLE DATA-QUALITY PROBLEMS and suggest additional cleaning steps.

You MUST return EXACTLY ONE JSON object with this SHAPE:

{
  "explanation": "string",
  "issues": ["string"],
  "actions": [
    {
      "type": "string",
      "column_index": 0
    }
  ]
}

IMPORTANT GLOBAL RULES:

1) Output ONLY ONE JSON object.
   - Do NOT explain anything before or after it.
   - The output MUST start with '{' and end with '}'.

2) "explanation":
   - A short human-readable summary of the most important problems you see.
   - If there are problems, explain them.
   - If the CSV is really clean, say that clearly (e.g. "The CSV structure looks consistent...").

3) "issues":
   - An ARRAY of strings.
   - Each string is a human-readable description of ONE concrete problem.
   - If you see ANY problem, "issues" MUST be NON-EMPTY.
   - If you are 100% sure there is NO problem at all, you MAY return an empty array [].
   - Treat even small problems (extra quotes, extra spaces, non-numeric values in a numeric column,
     inconsistent column counts, empty rows) as REAL problems.

4) "actions":
   - An ARRAY of objects describing cleaning steps.
   - If there is ANY problem, "actions" SHOULD be NON-EMPTY.
   - Each action object MUST have at least:
       { "type": "...", "column_index": 0 }
     (column_index is only required for numeric-related actions).
   - You MUST choose "type" from this LIMITED SET:

     - "TRIM_WHITESPACE"
       Trim leading/trailing spaces from all cells in all rows.

     - "STRIP_WRAPPING_QUOTES"
       Remove outer quotes "..." when they are unnecessary and only wrap the cell as a whole.

     - "ENSURE_EQUAL_COLUMNS"
       Make every row have the same number of columns as the header row.
       You do NOT specify the padding mode, the backend will decide.

     - "REMOVE_EMPTY_ROWS"
       Remove rows where all cells are empty or only whitespace.

     - "COERCE_NUMERIC"
       Clean a column that SHOULD be numeric (e.g. header "age" or "Életkor"):
       - "column_index" MUST be provided (0-based index).
       - You do NOT specify "on_error" mode, the backend will decide (drop row, set null, etc.).

   - Do NOT invent other action types.
   - If multiple problems exist, you may return multiple actions.

5) WHAT COUNTS AS A PROBLEM?

   You MUST treat the following as problems:

   - Any row having a different number of columns than the header.
   - Cells with unnecessary outer quotes that are not required for CSV escaping.
   - Leading or trailing spaces around values (especially in identifiers, names, numbers, emails, cities).
   - Rows where all cells are empty or just whitespace.
   - Non-numeric values in a column that looks numeric, for example:
       - the header suggests numeric (e.g. "age", "Életkor"),
       - OR most other values in that column are valid numbers.
   - Clearly malformed values breaking basic CSV structure.

6) EXAMPLES OF GOOD OUTPUTS (FORM ONLY, DO NOT COPY VERBATIM):

   {
     "explanation": "Some rows have fewer columns than the header, and Életkor contains non-numeric values.",
     "issues": [
       "Row 3 has fewer columns than the header.",
       "Row 2 has a non-numeric value in Életkor."
     ],
     "actions": [
       { "type": "ENSURE_EQUAL_COLUMNS" },
       { "type": "COERCE_NUMERIC", "column_index": 2 }
     ]
   }

   {
     "explanation": "The CSV structure looks consistent based on the header and sample rows.",
     "issues": [],
     "actions": []
   }

7) NEVER say "the CSV looks consistent" if:
   - there are extra quotes,
   - inconsistent number of columns,
   - non-numeric values in a numeric-looking column,
   - or obviously invalid/empty rows.

If you see ANY deviation from a perfectly clean CSV, you MUST:
- add at least one entry to "issues",
- and usually provide at least one entry in "actions".
    `.trim();
  }

  /**
   * USER PROMPT
   *
   * Itt adjuk át:
   * - a CSV mintát (PRE-CLEANED verzió),
   * - a delimiter-t,
   * - hasHeader flag-et.
   *
   * A system promptból tudja a modell, hogy ez már egy elő-tisztított CSV,
   * és a fennmaradó problémákra kell koncentrálnia.
   */
  private buildUserPrompt(input: AnalyzeCsvPromptInput): string {
    const { csvSample, delimiter, hasHeader } = input;

    const metaParts: string[] = [];
    if (delimiter) {
      metaParts.push(`Delimiter: "${delimiter}"`);
    }
    if (typeof hasHeader === 'boolean') {
      metaParts.push(`Has header: ${hasHeader}`);
    }

    const metaInfo =
      metaParts.length > 0 ? metaParts.join(' | ') : 'No extra meta info.';

    return `
You will now receive a SMALL SAMPLE of a CSV file that has ALREADY gone through
an initial deterministic cleaning pass (for example, basic whitespace trimming).

Use the metadata and the sample below to detect any remaining structural or
simple data-quality problems, and respond with EXACTLY ONE JSON object as specified.

Meta:
${metaInfo}

CSV SAMPLE:
${csvSample}
    `.trim();
  }
}

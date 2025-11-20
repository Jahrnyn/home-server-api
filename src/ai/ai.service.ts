import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

/**
 * Bemenet az AI-nak – ugyanaz a shape, mint AnalyzeCsvDto.
 */
export interface AnalyzeCsvPromptInput {
  csvSample: string;
  delimiter?: string;
  hasHeader?: boolean;
}

/**
 * Ollama /v1/chat/completions minimális válasz-típus.
 */
interface AiChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiUrl: string;
  private readonly model: string;

  constructor() {
    this.apiUrl =
      process.env.AI_AGENT_URL ?? 'http://127.0.0.1:11434/v1/chat/completions';

    this.model = process.env.AI_MODEL ?? 'llama3.2:1b';

    this.logger.log(`AI SERVICE INIT: url=${this.apiUrl}, model=${this.model}`);
  }

  /**
   * AI hívás: system + user prompt felépítése, HTTP POST az Ollama felé,
   * majd a message.content (nyers string) visszaadása.
   */
  async analyzeCsvPrompt(input: AnalyzeCsvPromptInput): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input);

    this.logger.log(
      `AI: calling agent at ${this.apiUrl} with model=${this.model}`,
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
        {
          timeout: 15000,
        },
      );

      this.logger.log('AI: response received from agent');

      const content = data.choices?.[0]?.message?.content;

      if (!content || typeof content !== 'string') {
        this.logger.error(
          `AI response has no usable content: ${JSON.stringify(data).substring(
            0,
            500,
          )}...`,
        );
        throw new Error('AI returned empty or invalid content.');
      }

      return content.trim();
    } catch (error: unknown) {
      // ---- AXIOS ERROR ----
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        const status = axiosError.response?.status;
        const body = axiosError.response?.data;
        const code = axiosError.code;

        this.logger.error(
          `AI AXIOS ERROR: message="${axiosError.message}", code="${code}", status=${status}`,
        );

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

        console.error(
          'AI-DEBUG-AXIOS:',
          axiosError.message,
          'code=',
          code,
          'status=',
          status,
        );

        // dobjuk tovább, hogy a felső réteg 500-at/400-at adjon
        throw axiosError;
      }

      // ---- sima JS Error ----
      if (error instanceof Error) {
        this.logger.error(`AI NON-AXIOS ERROR: ${error.message}`);
        console.error('AI-DEBUG-NON-AXIOS:', error.message);
        throw error;
      }

      // ---- valami totál ismeretlen ----
      const msg = String(error);
      this.logger.error(`AI UNKNOWN ERROR TYPE: ${msg}`);
      console.error('AI-DEBUG-UNKNOWN:', msg);
      throw new Error('Unknown error calling AI agent');
    }
  }

  // ---------------------------------------------------------------------------
  // SYSTEM PROMPT
  // ---------------------------------------------------------------------------

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

5) Treat even small problems (extra quotes, extra spaces, non-numeric values in a numeric column,
   inconsistent column counts, empty rows) as REAL problems.

Output MUST be a single JSON object only.
    `.trim();
  }

  // ---------------------------------------------------------------------------
  // USER PROMPT
  // ---------------------------------------------------------------------------

  private buildUserPrompt(input: AnalyzeCsvPromptInput): string {
    const { csvSample, delimiter, hasHeader } = input;

    const metaParts: string[] = [];
    if (delimiter) metaParts.push(`Delimiter: "${delimiter}"`);
    if (typeof hasHeader === 'boolean')
      metaParts.push(`Has header: ${hasHeader}`);

    const metaInfo =
      metaParts.length > 0 ? metaParts.join(' | ') : 'No extra meta info.';

    return `
You will now receive a SMALL SAMPLE of a CSV file that has ALREADY gone through
an initial deterministic cleaning pass.

Use the metadata and the sample below to detect any remaining structural or
simple data-quality problems, and respond with EXACTLY ONE JSON object.

Meta:
${metaInfo}

CSV SAMPLE:
${csvSample}
    `.trim();
  }
}

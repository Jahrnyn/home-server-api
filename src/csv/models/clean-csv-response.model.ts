import { AiReview } from './ai-review.model';

/**
 * Statisztikák a tisztításról – ezt a Nest számolja ki a TELJES CSV alapján.
 */
export interface CleanStats {
  rowsBefore: number;
  rowsAfter: number;
  columns: number;
  rowsChanged: number;
  rowsDropped: number;
}

/**
 * A /csv/clean endpoint válasza.
 *
 * - aiReview: AI által készített "műveleti terv" + magyarázat
 * - stats: a tényleges végrehajtás statisztikái (mennyi sort, cellát érintett)
 * - cleanedCsv: a megtisztított, letölthető CSV tartalom
 */
export interface CleanCsvResponse {
  aiReview: AiReview;
  stats: CleanStats;
  cleanedCsv: string;
}

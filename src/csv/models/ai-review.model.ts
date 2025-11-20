import { AnalyzeCsvAction } from './analyze-csv-response.model';

/**
 * Az AI által készített elemzés egységes, frontend-barát formában.
 * - explanation: rövid összefoglaló, mi volt a gond, mit fog csinálni.
 * - issues: felsorolás a talált problémákról.
 * - actions: az AI által javasolt lépések (AnalyzeCsvAction formában).
 */
export interface AiReview {
  explanation: string;
  issues: string[];
  actions: AnalyzeCsvAction[];
}

export interface AnalyzeCsvAction {
  type: string;
  columnIndex?: number;
}

export interface AnalyzeCsvResponse {
  explanation: string;
  issues: string[];
  actions: AnalyzeCsvAction[];
}

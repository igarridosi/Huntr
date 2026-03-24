export interface TranscriptPeriod {
  year: number;
  quarter: number;
  label: string;
  report_date: string | null;
}

export interface TranscriptMessage {
  id: string;
  speaker: string;
  role: "operator" | "executive" | "analyst" | "other";
  text: string;
}

export interface TranscriptDocument {
  ticker: string;
  year: number;
  quarter: number;
  title: string;
  source: "yahoo" | "alphavantage" | "derived";
  source_url?: string;
  generated_at: string;
  messages: TranscriptMessage[];
}

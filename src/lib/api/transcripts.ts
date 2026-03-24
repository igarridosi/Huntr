import { getCachedData, setCachedData } from "@/lib/api/cache";
import { getBatchEarningsInsights, getProfile } from "@/lib/api/yahoo";
import { getEarningsCallTranscriptFromAlphaVantage } from "@/lib/api/alphavantage";
import type { TranscriptDocument, TranscriptMessage, TranscriptPeriod } from "@/types/transcript";

const PERIODS_CACHE_KEY = "transcripts-periods-v1";
const DOC_CACHE_PREFIX = "transcript-doc-v1";

const PERIOD_TTL_MS = 12 * 60 * 60 * 1000;
const DOC_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TRANSCRIPT_FETCH_TIMEOUT_MS = 9_000;

interface YahooSearchNewsItem {
  title?: string;
  link?: string;
  publisher?: string;
  providerPublishTime?: number;
  relatedTickers?: string[];
}

interface YahooSearchResponse {
  news?: YahooSearchNewsItem[];
}

interface YahooTranscriptCandidate {
  title: string;
  url: string;
  publishedAt: string | null;
  content: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseQuarterLabel(label: string): { year: number; quarter: number } | null {
  const match = /Q([1-4])\s+(\d{4})/i.exec(label);
  if (!match) return null;
  return {
    quarter: Number(match[1]),
    year: Number(match[2]),
  };
}

function toPeriodLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

function inferRole(speaker: string): TranscriptMessage["role"] {
  const lower = speaker.toLowerCase();
  if (lower.includes("operator")) return "operator";
  if (
    lower.includes("analyst") ||
    lower.includes("bank") ||
    lower.includes("capital") ||
    lower.includes("research")
  ) {
    return "analyst";
  }
  if (
    lower.includes("chief") ||
    lower.includes("ceo") ||
    lower.includes("cfo") ||
    lower.includes("president") ||
    lower.includes("director") ||
    lower.includes("svp") ||
    lower.includes("vp")
  ) {
    return "executive";
  }
  return "other";
}

function normalizeSpeakerName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Unknown";
  if (cleaned.length > 48) return cleaned.slice(0, 48);
  return cleaned;
}

function parseTranscriptMessages(content: string): TranscriptMessage[] {
  const sanitized = content
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\t+/g, " ")
    .trim();

  const lines = sanitized.split(/\r?\n/).map((line) => line.trim());
  const chunks: TranscriptMessage[] = [];

  let activeSpeaker = "Operator";
  let activeRole: TranscriptMessage["role"] = "operator";
  let buffer: string[] = [];

  const pushBuffer = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (!text) return;
    chunks.push({
      id: `${chunks.length + 1}`,
      speaker: activeSpeaker,
      role: activeRole,
      text,
    });
    buffer = [];
  };

  for (const line of lines) {
    if (!line) {
      pushBuffer();
      continue;
    }

    const speakerColon = /^([A-Za-z][A-Za-z .,'-]{1,60}):\s*(.*)$/.exec(line);
    if (speakerColon) {
      pushBuffer();
      activeSpeaker = normalizeSpeakerName(speakerColon[1]);
      activeRole = inferRole(activeSpeaker);
      if (speakerColon[2]) buffer.push(speakerColon[2]);
      continue;
    }

    const speakerDash = /^([A-Za-z][A-Za-z .,'-]{1,60})\s+-\s+(.+)$/.exec(line);
    if (speakerDash) {
      pushBuffer();
      activeSpeaker = normalizeSpeakerName(speakerDash[1]);
      activeRole = inferRole(activeSpeaker);
      buffer.push(speakerDash[2]);
      continue;
    }

    const speakerSolo = /^([A-Za-z][A-Za-z .,'-]{1,60})$/.exec(line);
    if (speakerSolo && line.split(" ").length <= 5) {
      pushBuffer();
      activeSpeaker = normalizeSpeakerName(speakerSolo[1]);
      activeRole = inferRole(activeSpeaker);
      continue;
    }

    buffer.push(line);
  }

  pushBuffer();

  if (chunks.length === 0) {
    const paragraphChunks = sanitized
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((paragraph, idx) => ({
        id: `${idx + 1}`,
        speaker: idx === 0 ? "Operator" : "Speaker",
        role: idx === 0 ? "operator" : "other",
        text: paragraph,
      } satisfies TranscriptMessage));

    if (paragraphChunks.length > 0) return paragraphChunks;

    return [
      {
        id: "1",
        speaker: "Operator",
        role: "operator",
        text: sanitized.slice(0, 2000),
      },
    ];
  }

  return chunks.slice(0, 180);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\u00a0/g, " ");
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArticleTextFromHtml(html: string): string {
  const paragraphMatches = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  const paragraphText = paragraphMatches
    .map((paragraph) => stripHtml(paragraph))
    .filter((line) => line.length >= 30)
    .slice(0, 120)
    .join("\n\n")
    .trim();

  if (paragraphText.length >= 220) {
    return paragraphText;
  }

  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!bodyMatch) return "";
  return stripHtml(bodyMatch[1]).slice(0, 6000);
}

function scoreTranscriptCandidate(
  candidate: YahooSearchNewsItem,
  ticker: string,
  year: number,
  quarter: number
): number {
  const title = (candidate.title ?? "").toLowerCase();
  const related = (candidate.relatedTickers ?? []).map((item) => item.toUpperCase());
  let score = 0;

  if (/earnings call transcript/.test(title)) score += 6;
  if (title.includes(ticker.toLowerCase())) score += 4;
  if (title.includes(`q${quarter}`.toLowerCase())) score += 3;
  if (title.includes(`${year}`)) score += 3;
  if (related.includes(ticker)) score += 2;
  if ((candidate.link ?? "").includes("finance.yahoo.com")) score += 1;

  return score;
}

async function fetchYahooTranscriptCandidate(
  ticker: string,
  year: number,
  quarter: number
): Promise<YahooTranscriptCandidate | null> {
  const queries = [
    `${ticker} Q${quarter} ${year} earnings call transcript`,
    `${ticker} ${year} earnings call transcript`,
    `${ticker} earnings call transcript`,
  ];

  const headers = { "User-Agent": "Mozilla/5.0" };
  let best: YahooSearchNewsItem | null = null;
  let bestScore = 0;

  for (const query of queries) {
    try {
      const endpoint = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=50&quotesCount=0`;
      const response = await Promise.race([
        fetch(endpoint, { headers }),
        sleep(Math.min(TRANSCRIPT_FETCH_TIMEOUT_MS, 5000)).then(() => null),
      ]);

      if (!response || !response.ok) continue;
      const payload = (await response.json()) as YahooSearchResponse;
      const news = payload.news ?? [];

      for (const item of news) {
        const score = scoreTranscriptCandidate(item, ticker, year, quarter);
        if (score > bestScore) {
          best = item;
          bestScore = score;
        }
      }

      if (bestScore >= 12) break;
    } catch {
      continue;
    }
  }

  if (!best || bestScore < 8 || !best.link || !best.title) return null;

  let articleText = "";
  try {
    const articleResponse = await Promise.race([
      fetch(best.link, { headers }),
      sleep(Math.min(TRANSCRIPT_FETCH_TIMEOUT_MS, 6000)).then(() => null),
    ]);
    if (articleResponse && articleResponse.ok) {
      const html = await articleResponse.text();
      articleText = extractArticleTextFromHtml(html);
    }
  } catch {
    articleText = "";
  }

  const publishedAt =
    typeof best.providerPublishTime === "number"
      ? new Date(best.providerPublishTime * 1000).toISOString()
      : null;

  const fallbackText = `${best.title}. Source: ${best.publisher ?? "Yahoo Finance"}. Open source URL for the complete transcript content.`;

  return {
    title: best.title,
    url: best.link,
    publishedAt,
    content: articleText.length > 0 ? articleText : fallbackText,
  };
}

function buildDerivedTranscript(
  ticker: string,
  year: number,
  quarter: number,
  companyName: string | null,
  estimateEps: number | null,
  reportedEps: number | null,
  surprise: number | null
): TranscriptDocument {
  const name = companyName ?? ticker;
  const estimateLine =
    estimateEps != null
      ? `Consensus EPS for the quarter was around ${estimateEps.toFixed(2)}.`
      : "Consensus EPS was not available from the source feed.";
  const reportedLine =
    reportedEps != null
      ? `${name} reported EPS near ${reportedEps.toFixed(2)} for this quarter.`
      : `${name} has no reported EPS value in the current transcript source window.`;
  const surpriseLine =
    surprise != null
      ? `EPS surprise was approximately ${surprise.toFixed(2)}%.`
      : "EPS surprise data was not provided.";

  return {
    ticker,
    year,
    quarter,
    title: `${ticker} Earnings Call Transcript` ,
    source: "derived",
    generated_at: new Date().toISOString(),
    messages: [
      {
        id: "1",
        speaker: "Operator",
        role: "operator",
        text: `Official transcript is temporarily unavailable for ${toPeriodLabel(year, quarter)}. This is an API-derived briefing summary for quick review.`,
      },
      {
        id: "2",
        speaker: "System Summary",
        role: "other",
        text: `${reportedLine} ${estimateLine} ${surpriseLine}`,
      },
      {
        id: "3",
        speaker: "Analyst Notes",
        role: "analyst",
        text: "Use this placeholder as context only. When the transcript provider responds again, the full speaker-by-speaker call will replace this summary automatically.",
      },
    ],
  };
}

export async function getTranscriptPeriods(ticker: string): Promise<TranscriptPeriod[]> {
  const key = ticker.toUpperCase();
  const cached = await getCachedData<TranscriptPeriod[]>(key, PERIODS_CACHE_KEY, PERIOD_TTL_MS);
  if (cached && cached.length > 0) return cached;

  const insights = await getBatchEarningsInsights([key]);
  const history = insights[key]?.history ?? [];

  const periods = history
    .map((point) => {
      const parsed = parseQuarterLabel(point.quarter);
      if (!parsed) return null;
      return {
        year: parsed.year,
        quarter: parsed.quarter,
        label: toPeriodLabel(parsed.year, parsed.quarter),
        report_date: point.report_date,
      } satisfies TranscriptPeriod;
    })
    .filter((period): period is TranscriptPeriod => period !== null)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.quarter - a.quarter;
    })
    .slice(0, 12);

  if (periods.length > 0) {
    await setCachedData(key, PERIODS_CACHE_KEY, periods as unknown as Record<string, unknown>);
  }

  return periods;
}

export async function getTranscriptDocument(
  ticker: string,
  year: number,
  quarter: number
): Promise<TranscriptDocument | null> {
  const key = ticker.toUpperCase();
  const docKey = `${DOC_CACHE_PREFIX}-${year}Q${quarter}`;
  const cached = await getCachedData<TranscriptDocument>(key, docKey, DOC_TTL_MS);
  if (cached) return cached;

  const yahooCandidate = await fetchYahooTranscriptCandidate(key, year, quarter);
  if (yahooCandidate) {
    const parsedMessages = parseTranscriptMessages(yahooCandidate.content);
    const yahooDoc: TranscriptDocument = {
      ticker: key,
      year,
      quarter,
      title: yahooCandidate.title,
      source: "yahoo",
      source_url: yahooCandidate.url,
      generated_at: yahooCandidate.publishedAt ?? new Date().toISOString(),
      messages: parsedMessages,
    };
    await setCachedData(key, docKey, yahooDoc as unknown as Record<string, unknown>);
    return yahooDoc;
  }

  const alphaKey = process.env.ALPHAVANTAGE_API_KEY?.trim();

  if (alphaKey) {
    const transcript = await Promise.race([
      getEarningsCallTranscriptFromAlphaVantage(key, year, quarter, alphaKey),
      sleep(TRANSCRIPT_FETCH_TIMEOUT_MS).then(() => null),
    ]);
    if (transcript) {
      const parsedMessages = parseTranscriptMessages(transcript.content);
      const doc: TranscriptDocument = {
        ticker: key,
        year,
        quarter,
        title: `${key} Earnings Call Transcript`,
        source: "alphavantage",
        generated_at: transcript.published_at ?? new Date().toISOString(),
        messages: parsedMessages,
      };
      await setCachedData(key, docKey, doc as unknown as Record<string, unknown>);
      return doc;
    }
  }

  const [insights, profile] = await Promise.all([
    getBatchEarningsInsights([key]),
    getProfile(key),
  ]);

  const matched = (insights[key]?.history ?? []).find((row) => {
    const parsed = parseQuarterLabel(row.quarter);
    return parsed?.year === year && parsed.quarter === quarter;
  });

  const fallback = buildDerivedTranscript(
    key,
    year,
    quarter,
    profile?.name ?? null,
    matched?.eps_estimate ?? null,
    matched?.eps_actual ?? null,
    matched?.surprise_percent ?? null
  );

  await setCachedData(key, docKey, fallback as unknown as Record<string, unknown>);
  return fallback;
}

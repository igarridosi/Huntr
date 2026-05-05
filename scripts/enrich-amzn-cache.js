/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { execFileSync } = require('child_process');

async function main() {
  const sup = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error } = await sup
    .from('stock_cache')
    .select('data,last_updated')
    .eq('ticker', 'AMZN')
    .eq('cache_key', 'earnings-alpha-v1')
    .single();

  if (error) {
    console.error('Supabase select error', error);
  }

  const existingPayload = row?.data ?? null;
  console.log('existing rows', existingPayload ? (existingPayload.rows || []).length : 0);

  try {
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const out = execFileSync(pythonBin, ['scripts/yfinance-quarterly-metrics.py', '--ticker', 'AMZN', '--limit', '16'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const yf = JSON.parse(out);
    console.log('yf rows', Array.isArray(yf.rows) ? yf.rows.length : 0);

    const existingMap = new Map();
    const keyFor = (r) => r.fiscal_date ?? r.quarter ?? r.report_date ?? '';

    if (existingPayload && Array.isArray(existingPayload.rows)) {
      for (const r of existingPayload.rows) {
        existingMap.set(keyFor(r) || `${r.quarter}-${r.report_date}`, { ...r });
      }
    }

    if (yf && Array.isArray(yf.rows)) {
      for (const y of yf.rows) {
        const fiscal = y.close_date ?? y.quarter ?? null;
        const k = fiscal ?? `${y.quarter}-${y.close_date}`;
        const existing = existingMap.get(k);
        const yRow = {
          fiscal_date: y.close_date ?? null,
          report_date: y.close_date ?? null,
          quarter: y.quarter ?? null,
          eps_actual: y.eps ?? null,
          eps_estimate: y.eps_estimate ?? null,
          revenue_actual: y.revenue ?? null,
          revenue_estimate: null,
        };

        if (!existing) existingMap.set(k, yRow);
        else
          existingMap.set(k, {
            fiscal_date: existing.fiscal_date ?? yRow.fiscal_date,
            report_date: existing.report_date ?? yRow.report_date,
            quarter: existing.quarter ?? yRow.quarter,
            eps_actual: existing.eps_actual ?? yRow.eps_actual,
            eps_estimate: existing.eps_estimate ?? yRow.eps_estimate,
            revenue_actual: existing.revenue_actual ?? yRow.revenue_actual,
            revenue_estimate: existing.revenue_estimate ?? yRow.revenue_estimate,
          });
      }
    }

    const merged = Array.from(existingMap.values())
      .map((r) => ({ r, ts: r.fiscal_date ? new Date(r.fiscal_date).getTime() : 0 }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 16)
      .map((v) => v.r);

    const payload = {
      ticker: 'AMZN',
      rows: merged,
      next_estimate: existingPayload?.next_estimate ?? null,
      fetched_at: new Date().toISOString(),
    };

    const up = await sup.from('stock_cache').upsert(
      {
        ticker: 'AMZN',
        cache_key: 'earnings-alpha-v1',
        data: payload,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'ticker,cache_key' }
    );

    console.log(JSON.stringify(up, null, 2));
  } catch (e) {
    console.error('error', e);
  }
}

main().catch((e) => console.error(e));

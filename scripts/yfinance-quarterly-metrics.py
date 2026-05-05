import argparse
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

import pandas as pd
import yfinance as yf


def normalize_label(value: str) -> str:
    return "".join(ch for ch in value.lower().strip() if ch.isalnum())


def find_label(index_values, primary: str, fallbacks) -> Optional[str]:
    normalized = {normalize_label(str(item)): str(item) for item in index_values}
    primary_key = normalize_label(primary)
    if primary_key in normalized:
        return normalized[primary_key]
    for candidate in fallbacks:
        key = normalize_label(candidate)
        if key in normalized:
            return normalized[key]
    return None


def find_label_by_keywords(index_values, keywords) -> Optional[str]:
    for item in index_values:
        label = str(item)
        normalized = normalize_label(label)
        if all(keyword in normalized for keyword in keywords):
            return label
    return None


def to_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    try:
        parsed = float(value)
        if pd.isna(parsed):
            return None
        return parsed
    except Exception:
        return None


def quarter_label(date: datetime) -> str:
    quarter = (date.month - 1) // 3 + 1
    return f"Q{quarter} {date.year}"


def quarter_key(date: datetime) -> str:
    quarter = (date.month - 1) // 3 + 1
    return f"{date.year}-Q{quarter}"


def parse_earnings_dates(ticker_obj) -> Dict[str, Dict[str, Any]]:
    try:
        if hasattr(ticker_obj, "get_earnings_dates"):
            df = ticker_obj.get_earnings_dates(limit=32)
        else:
            df = getattr(ticker_obj, "earnings_dates", None)
    except Exception:
        return {"map": {}, "next_date": None}

    if df is None or len(df) == 0:
        return {"map": {}, "next_date": None}

    df = df.copy()
    if "Earnings Date" in df.columns:
        df["Earnings Date"] = pd.to_datetime(df["Earnings Date"], errors="coerce")
        df = df.set_index("Earnings Date")

    df.index = pd.to_datetime(df.index, errors="coerce")
    df = df[df.index.notna()]
    if len(df) == 0:
        return {"map": {}, "next_date": None}

    columns = {str(col).lower().strip(): col for col in df.columns}
    estimate_col = (
        columns.get("eps estimate")
        or columns.get("eps_estimate")
        or columns.get("estimated eps")
        or columns.get("eps avg")
        or columns.get("eps average")
    )
    reported_col = (
        columns.get("reported eps")
        or columns.get("reported_eps")
        or columns.get("eps")
        or columns.get("eps reported")
    )

    estimate_map: Dict[str, Dict[str, Any]] = {}
    now = pd.Timestamp.utcnow().normalize()
    next_date: Optional[str] = None

    for idx, row in df.iterrows():
        if pd.isna(idx):
            continue
        key = quarter_key(idx.to_pydatetime())
        estimate = to_float(row[estimate_col]) if estimate_col else None
        reported = to_float(row[reported_col]) if reported_col else None

        current = estimate_map.get(key)
        if current is None or idx > current["date"]:
            estimate_map[key] = {
                "date": idx,
                "estimate": estimate,
                "reported": reported,
            }

        if idx >= now and (next_date is None or idx < pd.Timestamp(next_date)):
            next_date = idx.date().isoformat()

    return {"map": estimate_map, "next_date": next_date}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True)
    parser.add_argument("--limit", type=int, default=16)
    args = parser.parse_args()

    ticker = args.ticker.strip().upper()
    limit = max(1, min(args.limit, 32))

    try:
        ticker_obj = yf.Ticker(ticker)
        income = ticker_obj.quarterly_income_stmt
        if income is None or getattr(income, "empty", True):
            if hasattr(ticker_obj, "get_income_stmt"):
                income = ticker_obj.get_income_stmt(freq="quarterly")
            elif hasattr(ticker_obj, "income_stmt"):
                income = ticker_obj.income_stmt
    except Exception as exc:
        print(json.dumps({"error": f"yfinance failed: {exc}"}))
        return 1

    if income is None or getattr(income, "empty", True):
        print(json.dumps({"error": "quarterly_income_stmt is empty"}))
        return 1

    revenue_label = (
        find_label(income.index, "Total Revenue", ["TotalRevenue", "Revenue"]) or
        find_label_by_keywords(income.index, ["total", "revenue"]) or
        find_label_by_keywords(income.index, ["revenue"])
    )

    eps_label = (
        find_label(income.index, "Basic EPS", ["BasicEPS"]) or
        find_label(income.index, "Diluted EPS", ["DilutedEPS"]) or
        find_label_by_keywords(income.index, ["basic", "eps"]) or
        find_label_by_keywords(income.index, ["diluted", "eps"]) or
        find_label_by_keywords(income.index, ["eps"])
    )

    df = income.copy()
    df = df.transpose()
    df.index = pd.to_datetime(df.index, errors="coerce")
    df = df[df.index.notna()].sort_index(ascending=False)

    revenue_series = df[revenue_label] if revenue_label and revenue_label in df.columns else None
    eps_series = df[eps_label] if eps_label and eps_label in df.columns else None

    if revenue_series is None and eps_series is None:
        print(json.dumps({"error": "Revenue/EPS rows not found"}))
        return 1

    if df.index.isna().all():
        print(json.dumps({"error": "No valid quarterly columns"}))
        return 1

    earnings_dates = parse_earnings_dates(ticker_obj)
    estimate_map = earnings_dates["map"]
    next_earnings_date = earnings_dates["next_date"]

    rows = []
    for idx, row in df.iterrows():
        close_date = idx.date().isoformat()
        key = quarter_key(idx.to_pydatetime())
        estimate_entry = estimate_map.get(key, {})

        revenue_value = to_float(revenue_series.get(idx)) if revenue_series is not None else None
        eps_value = to_float(eps_series.get(idx)) if eps_series is not None else None
        eps_estimate = estimate_entry.get("estimate")
        eps_reported = estimate_entry.get("reported")
        if eps_value is None:
            eps_value = eps_reported

        rows.append({
            "close_date": close_date,
            "quarter": quarter_label(idx.to_pydatetime()),
            "revenue": revenue_value,
            "eps": eps_value,
            "eps_estimate": eps_estimate,
            "eps_reported": eps_reported,
        })

    rows = sorted(rows, key=lambda row: row["close_date"], reverse=True)
    actual_count = len(rows)
    rows = rows[:limit]
    actual_count = min(actual_count, limit)

    last_actual_date = None
    if rows:
        last_actual_date = datetime.fromisoformat(rows[0]["close_date"])

    if last_actual_date:
        future_candidates = [
            entry for entry in estimate_map.values()
            if entry.get("date") is not None and entry["date"].to_pydatetime() > last_actual_date
        ]
        if future_candidates:
            future_candidates.sort(key=lambda entry: entry["date"])
            future = future_candidates[0]
            future_date = future["date"].to_pydatetime().date().isoformat()
            future_quarter = quarter_label(future["date"].to_pydatetime())
            has_future = any(row["quarter"] == future_quarter for row in rows)
            if not has_future:
                rows.append({
                    "close_date": future_date,
                    "quarter": future_quarter,
                    "revenue": None,
                    "eps": None,
                    "eps_estimate": future.get("estimate"),
                    "eps_reported": future.get("reported"),
                })
                rows = sorted(rows, key=lambda row: row["close_date"], reverse=True)

    history_incomplete = actual_count < limit

    output = {
        "ticker": ticker,
        "history_incomplete": history_incomplete,
        "available_quarters": actual_count,
        "next_earnings_date": next_earnings_date,
        "rows": rows,
    }

    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    sys.exit(main())

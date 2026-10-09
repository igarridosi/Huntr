# DCF benchmark — 2026-10-09

Each company is read the way the DCF page reads it on Auto-Populate (`evaluateCompany`). **fail** = a figure that moves the value is wrong or missing; **warn** = data right, but the model fits poorly or a figure only came from a vendor; **pass** = every check the filings allow passed.

| Group | N | pass | warn | fail | data OK |
|---|---|---|---|---|---|
| US filers | 39 | 13 | 26 | 0 | 100% |
| Foreign filers | 7 | 1 | 6 | 0 | 100% |
| **All** | 46 | 14 | 32 | 0 | 100% |

| Ticker | Group | Verdict | Shares (src, vs mkt cap) | Debt (src) | Cash (src) | SBC | Shift | Reliability (data/fit) | Regimes |
|---|---|---|---|---|---|---|---|---|---|
| AAPL | us_megacap | **pass** | sec, 0.8% | 84.3B (sec) | 62.4B (sec) | 2.9% | -2.9% | 89 A (77/95) | – |
| MSFT | us_megacap | **warn** | sec, 0.3% | 40.3B (sec) | 76.8B (sec) | 3.7% | -3.8% | 83 B (100/60) | capexPeak |
| AMZN | us_megacap | **warn** | sec, 1.1% | 132.5B (sec) | 123.0B (sec) | 2.6% | -2.8% | 61 C (80/25) | capexPeak, thinMargin |
| NVDA | us_megacap | **pass** | sec, 0.6% | 33.4B (sec) | 22.4B (sec) | 2.4% | -2.3% | 86 A (80/90) | – |
| META | us_megacap | **warn** | sec, 0.7% | 84.0B (sec) | 90.3B (sec) | 11.0% | -11.2% | 78 B (97/50) | capexPeak |
| V | us_megacap | **pass** | sec, 1.1% | 24.0B (sec) | 12.4B (sec) | 2.1% | -0.6% | 90 A (87/95) | – |
| MA | us_megacap | **pass** | sec, 0.8% | 24.6B (sec) | 11.3B (sec) | 1.8% | -0.0% | 93 A (97/95) | – |
| COST | us_megacap | **warn** | sec, 0.3% | 6.2B (sec) | 21.3B (sec) | 0.3% | -0.4% | 76 B (77/70) | thinMargin |
| WMT | us_megacap | **warn** | sec, 0.6% | 50.4B (sec) | 11.5B (sec) | 0.5% | -0.3% | 75 B (97/70) | terminalHeavy, thinMargin |
| KO | us_megacap | **warn** | sec, 0.3% | 43.8B (sec) | 10.6B (sec) | 0.5% | 0.7% | 76 B (87/95) | terminalHeavy |
| PEP | us_megacap | **warn** | sec, 0.1% | 51.9B (sec) | 11.2B (sec) | 0.3% | 0.6% | 66 C (74/80) | terminalHeavy, leveraged |
| JNJ | us_megacap | **warn** | sec, 1.3% | 49.0B (sec) | 20.8B (sec) | 1.4% | -1.4% | 75 B (74/95) | terminalHeavy |
| UNH | us_megacap | **warn** | sec, 0.9% | 73.3B (sec) | 31.5B (sec) | 0.2% | 0.5% | 71 B (97/55) | terminalHeavy, leveraged, thinMargin |
| GOOGL | us_multiclass | **warn** | sec, 0.7% | 100.2B (sec) | 242.5B (sec) | 6.3% | -6.8% | 84 B (97/60) | capexPeak |
| BRK-B | us_multiclass | **warn** | sec, 0.7% | 125.8B (yahoo) | 41.4B (sec) | 0.0% | -3.6% | 38 D (74/0) | lender, terminalHeavy |
| LULU | us_multiclass | **pass** | sec, 2.0% | 0M (sec) | 1.4B (sec) | 0.8% | -0.8% | 76 B (54/95) | – |
| NKE | us_multiclass | **warn** | sec, -0.1% | 7.9B (sec) | 6.9B (sec) | 1.5% | -1.5% | 84 B (90/70) | thinMargin |
| CRM | us_high_sbc | **warn** | sec, -0.2% | 39.3B (sec) | 11.4B (sec) | 8.3% | -6.9% | 91 A (97/80) | leveraged |
| NOW | us_high_sbc | **warn** | sec, 0.1% | 7.5B (sec) | 4.7B (sec) | 14.8% | -16.3% | 77 B (79/65) | shiftingPerimeter |
| ADBE | us_high_sbc | **pass** | sec, 1.6% | 6.4B (sec) | 5.6B (sec) | 8.0% | -7.2% | 92 A (80/100) | – |
| RDDT | us_high_sbc | **pass** | sec, 5.0% | 0M (sec) | 2.8B (sec) | 12.2% | -12.2% | 72 B (74/65) | – |
| DUOL | us_high_sbc | **pass** | sec, 6.9% | 0M (sec) | 1.2B (sec) | 12.6% | -15.9% | 85 A (74/95) | – |
| APP | us_high_sbc | **warn** | sec, 0.7% | 3.5B (sec) | 3.1B (sec) | 4.1% | -1.6% | 79 B (82/65) | shiftingPerimeter |
| CART | us_high_sbc | **pass** | sec, 4.9% | 0M (sec) | 850M (sec) | 10.0% | -10.8% | 83 B (74/95) | – |
| UBER | us_high_sbc | **pass** | sec, 0.4% | 10.6B (sec) | 5.4B (sec) | 3.5% | -3.9% | 93 A (97/95) | – |
| NFLX | us_high_sbc | **pass** | sec, 2.3% | 16.8B (sec) | 9.1B (sec) | 1.0% | -4.7% | 94 A (97/85) | – |
| SNPS | us_acquirers_leveraged | **warn** | sec, 0.4% | 10.0B (sec) | 3.6B (sec) | 10.1% | -5.2% | 74 B (82/55) | leveraged, shiftingPerimeter |
| ELF | us_acquirers_leveraged | **warn** | sec, 1.2% | 832M (sec) | 344M (sec) | 5.5% | -3.9% | 77 B (100/50) | leveraged, shiftingPerimeter |
| FIS | us_acquirers_leveraged | **warn** | sec, 0.0% | 21.2B (sec) | 744M (sec) | 1.5% | 2.0% | 66 C (72/50) | leveraged, shiftingPerimeter |
| T | us_acquirers_leveraged | **warn** | sec, 1.4% | 144.0B (sec) | 17.6B (sec) | 0.4% | 4.6% | 76 B (97/80) | terminalHeavy, leveraged |
| CELH | us_acquirers_leveraged | **warn** | sec, 1.5% | 675M (sec) | 631M (sec) | 1.1% | 0.0% | 68 C (82/50) | leveraged, shiftingPerimeter |
| SPGI | us_acquirers_leveraged | **warn** | sec, 0.9% | 13.3B (sec) | 1.8B (sec) | 1.4% | 0.1% | 82 B (87/70) | shiftingPerimeter |
| F | us_old_tags_or_few_tags | **warn** | sec, 2.1% | 106.0B (yahoo) | 30.5B (sec) | 0.3% | -0.2% | 74 B (74/70) | leveraged |
| XOM | us_old_tags_or_few_tags | **warn** | sec, 0.0% | 42.4B (sec) | 10.6B (sec) | 0.0% | 0.2% | 77 B (77/95) | terminalHeavy |
| SBUX | us_old_tags_or_few_tags | **warn** | sec, 0.3% | 13.3B (sec) | 3.6B (sec) | 0.9% | -0.2% | 78 B (77/80) | leveraged |
| CLX | us_old_tags_or_few_tags | **warn** | sec, 0.7% | 4.1B (sec) | 1.2B (sec) | 0.0% | 1.4% | 69 C (77/80) | terminalHeavy, leveraged |
| DE | us_old_tags_or_few_tags | **pass** | sec, 0.4% | 17.1B (sec) | 8.9B (sec) | 0.4% | 4.3% | 84 B (74/95) | – |
| CAT | us_old_tags_or_few_tags | **warn** | sec, 0.6% | 36.2B (sec) | 6.7B (sec) | 0.3% | 0.2% | 91 A (94/80) | leveraged |
| CMG | us_old_tags_or_few_tags | **pass** | sec, 1.1% | 0M (sec) | 678M (sec) | 0.8% | -1.1% | 92 A (94/95) | – |
| ONON | foreign_filers | **warn** | implied, -11.2% | 0M (sec) | 1.3B (yahoo) | 2.1% | -5.4% | 71 B (53/75) | – |
| NVO | foreign_filers | **warn** | implied, -24.3% | 16.8B (yahoo) | 4.0B (yahoo) | 0.4% | -1.0% | 52 D (53/60) | capexPeak |
| TSM | foreign_filers | **warn** | sec, 0.0% | 28.1B (yahoo) | 98.0B (yahoo) | 0.0% | -1.9% | 74 B (59/85) | – |
| ASML | foreign_filers | **warn** | sec, 0.3% | 4.9B (sec) | 15.0B (sec) | 0.6% | -0.8% | 87 A (85/85) | – |
| HLN | foreign_filers | **warn** | sec, 1.8% | 10.1B (yahoo) | 1.7B (yahoo) | 0.8% | 0.7% | 64 C (59/80) | terminalHeavy, leveraged |
| SAP | foreign_filers | **warn** | implied, 6.4% | 4.7B (yahoo) | 11.0B (yahoo) | 4.4% | -5.7% | 78 B (53/95) | – |
| SHOP | foreign_filers | **pass** | sec, 0.9% | 0M (sec) | 4.9B (sec) | 3.6% | -5.5% | 81 B (74/75) | – |

## Failures


## Warnings

- **MSFT**
  - Regime Capex peak: capex 34.9% of revenue; against 18.1% in earlier years
- **AMZN**
  - Autofill value implausible (-92% vs price): the model, not the data
  - Regime Capex peak: capex 18.4% of revenue; against 12.4% in earlier years
  - Regime Thin margin: FCF margin 1.1%
- **META**
  - Regime Capex peak: capex 34.7% of revenue; against 22.6% in earlier years
- **COST**
  - Regime Thin margin: FCF margin 2.8%
- **WMT**
  - Regime Terminal-heavy: 67.4% of value in the terminal
  - Regime Thin margin: FCF margin 2.1%
- **KO**
  - Regime Terminal-heavy: 72.0% of value in the terminal
- **PEP**
  - Regime Terminal-heavy: 72.2% of value in the terminal
  - Regime Leveraged: debt 3.3× EBITDA
- **JNJ**
  - Regime Terminal-heavy: 72.6% of value in the terminal
- **UNH**
  - Regime Terminal-heavy: 69.5% of value in the terminal
  - Regime Leveraged: debt 3.2× EBITDA
  - Regime Thin margin: FCF margin 3.6%
- **GOOGL**
  - Regime Capex peak: capex 22.7% of revenue; against 11.1% in earlier years
- **BRK-B**
  - Record: A lender's or insurer's operating cash flow moves with its book, not its profitability: no FCF margin record to project from.
  - Regime Lender or insurer: Thin equity against assets with interest as the business, or an unclassified balance sheet.
  - Regime Terminal-heavy: 72.6% of value in the terminal
- **NKE**
  - Regime Thin margin: FCF margin 4.7%
- **CRM**
  - Regime Leveraged: debt 3.1× EBITDA
- **NOW**
  - Perimeter: Trailing twelve months ($14.73B) and the closed year ($13.28B) are 11.0% apart — an acquisition, a spin-off or fast growth. Confirm which base describes today's perimeter.
  - Record: Revenue moved 23.8% between 2022 and 2023. If that came from a disposal or an acquisition rather than from trading, the years on either side are not describing the same company.
  - Regime Shifting perimeter: acquisition of $8.78B to 2026-06-30; trailing twelve months 11.0% above the closed year
- **APP**
  - Perimeter: Trailing twelve months ($6.83B) and the closed year ($5.48B) are 24.6% apart — an acquisition, a spin-off or fast growth. Confirm which base describes today's perimeter.
  - Record: The FCF margin moved from 14.6% to 54.2% between 2022 and 2023. A step that size is usually a change in what is being measured — a disposal, an acquisition or a restatement — rather than a change in the business. Revenue moved 34.6% between 2022 and 2023. If that came from a disposal or an acquisition rather than from trading, the years on either side are not describing the same company. A free cash flow margin above 70.0% is higher than any operating business sustains. The revenue and the cash flow are probably not describing the same set of operations.
  - Regime Shifting perimeter: disposal of $425M to 2025-06-30; trailing twelve months 24.6% above the closed year
- **SNPS**
  - Perimeter: Trailing twelve months ($9.42B) and the closed year ($7.05B) are 33.5% apart — an acquisition, a spin-off or fast growth. Confirm which base describes today's perimeter.
  - Regime Leveraged: debt 4.0× EBITDA
  - Regime Shifting perimeter: acquisition of $16.68B to 2025-07-31; disposal of $1.45B to 2024-10-31; trailing twelve months 33.5% above the closed year
- **ELF**
  - Record: Revenue moved 76.9% between 2023 and 2024. If that came from a disposal or an acquisition rather than from trading, the years on either side are not describing the same company.
  - Regime Leveraged: debt 5.2× EBITDA
  - Regime Shifting perimeter: acquisition of $582M to 2026-03-31
- **FIS**
  - Perimeter: Trailing twelve months ($12.20B) and the closed year ($10.68B) are 14.3% apart — an acquisition, a spin-off or fast growth. Confirm which base describes today's perimeter.
  - Record: The FCF margin moved from 6.4% to 36.2% between 2022 and 2023. A step that size is usually a change in what is being measured — a disposal, an acquisition or a restatement — rather than a change in the business.
  - Regime Leveraged: debt 6.1× EBITDA
  - Regime Shifting perimeter: acquisition of $7.86B to 2026-06-30; trailing twelve months 14.3% above the closed year
- **T**
  - Regime Terminal-heavy: 71.3% of value in the terminal
  - Regime Leveraged: debt 2.6× EBITDA
- **CELH**
  - Perimeter: Trailing twelve months ($3.05B) and the closed year ($2.52B) are 21.2% apart — an acquisition, a spin-off or fast growth. Confirm which base describes today's perimeter.
  - Record: Revenue moved 101.7% between 2022 and 2023. If that came from a disposal or an acquisition rather than from trading, the years on either side are not describing the same company.
  - Regime Leveraged: debt 3.3× EBITDA
  - Regime Shifting perimeter: acquisition of $1.28B to 2025-09-30; trailing twelve months 21.2% above the closed year
- **SPGI**
  - Regime Shifting perimeter: disposal of $1.55B to 2025-12-31
- **F**
  - Regime Leveraged: debt 29.1× EBITDA
- **XOM**
  - Regime Terminal-heavy: 69.8% of value in the terminal
- **SBUX**
  - Regime Leveraged: debt 2.8× EBITDA
- **CLX**
  - Regime Terminal-heavy: 70.4% of value in the terminal
  - Regime Leveraged: debt 3.5× EBITDA
- **CAT**
  - Regime Leveraged: debt 2.5× EBITDA
- **ONON**
  - Share count from implied, not a filing
  - No depositary ratio fits: one share per unit assumed
- **NVO**
  - Regime Capex peak: capex 29.2% of revenue; against 16.7% in earlier years; 75.1% of value in the terminal
  - Share count from implied, not a filing
  - Converted from DKK
- **TSM**
  - Converted from TWD
- **ASML**
  - Converted from EUR
- **HLN**
  - Regime Terminal-heavy: 71.2% of value in the terminal
  - Regime Leveraged: debt 2.7× EBITDA
  - Converted from GBP
- **SAP**
  - Share count from implied, not a filing
  - Converted from EUR

# 001 — Chart Builder

| | |
|---|---|
| Estado | Fases 0–1 mergeadas (#17, #18); fase 2 en PR (`feat/chart-builder-2`); fases 3–4 TODO |
| Escrito contra | `b54ba8a` (main, 2026-09-15) |
| Esfuerzo | L (4 fases entregables por separado; MVP = fases 0–1) |
| Riesgo de la implementación | Medio — todo es código nuevo y aislado; el único punto de contacto con lo existente es el sidebar, una migración y (fase 3) un botón en `ExpandChartDialog` |
| Dependencias nuevas | **Ninguna.** Recharts 3.7, React Query 5, Supabase JS, lucide y framer-motion ya están en el árbol |

> Este documento es autocontenido. Quien lo ejecute no ha visto la conversación en la que se escribió. Cuando el código y este documento discrepen, manda el código; cuando este documento y `ARCHITECTURE.md`/`DESIGN_SYSTEM.md` discrepen, mandan ellos.

---

## 1. Qué construimos y por qué

Una sección nueva, `/app/chart-builder`, donde el usuario compone un gráfico a partir de **series** — cada serie es *(ticker, métrica, transformación, forma)* — y lo ajusta visualmente hasta que le sirve para pensar o para compartir. Cubre tres usos que hoy Huntr no resuelve y que Qualtrim/Koyfin sí:

1. **Comparar empresas en una métrica** — p. ej. ingresos trimestrales de GOOG, AMZN, META y MSFT apilados desde 2009.
2. **Comparar precios indexados** — NFLX vs SPOT en % desde una fecha base.
3. **Contrastar dos magnitudes de una misma empresa** — FCF/acción (barras) contra precio (línea) en ejes distintos.

Y además: personalización (tema del lienzo, colores, leyenda, etiquetas, título, formato), exportación a PNG con marca de agua, enlace compartible y guardado en la cuenta.

**Lo que ya tenemos y reutilizamos** (nada de esto se modifica):

- Estados financieros anual/trimestral por ticker: `fetchCompanyFinancials` (`src/app/actions/stock.ts:103`) → `CompanyFinancials` (`src/types/financials.ts`). Con Alpha Vantage cacheado llegan ~20 años de anuales y ~80 trimestres; con el fallback Yahoo, 4–5 periodos. El builder debe verse bien con ambos.
- Cierres diarios por lote: `fetchBatchDailyHistory(tickers, "ALL")` (`src/app/actions/stock.ts:76`) → `Record<ticker, {date, close}[]>`; `"ALL"` = 10 años (`src/lib/api/yahoo.ts:1331`).
- Hooks React Query: `useFinancials(ticker, periodType)` y `useBatchDailyHistory(tickers, window)` en `src/hooks/use-stock-data.ts:224` y `:153`.
- Búsqueda de tickers: `useSearch(query, limit)` (`src/hooks/use-stock-data.ts:241`) y el patrón de input en `src/components/dcf/dcf-ticker-input.tsx`.
- Colores de gráfico conscientes del tema: `useChartColors()` (`src/hooks/use-chart-colors.ts`). Tooltip: `src/components/charts/chart-tooltip.tsx`.
- Persistencia por usuario con RLS: `supabase/migrations/006_user_dcf_scenarios.sql` + `src/hooks/use-dcf-scenarios.ts` (patrón a copiar).
- Gate de autenticación: `useAuthGate().openGate(reason)` (`src/providers/auth-gate-provider.tsx:121`).
- Primitivas UI: `SegmentedTabs`, `SelectMenu`, `Dialog`, `Button`, `Badge`, `Skeleton`, `Input` en `src/components/ui/`.
- Patrón de carga diferida de Recharts (`next/dynamic`, `ssr: false`, `loading` con `Skeleton`) tal como está en `src/app/(platform)/symbol/[ticker]/page.tsx` y `src/app/(platform)/app/dcf-calculator/page.tsx`.

---

## 2. Análisis de las referencias visuales

Se recibieron tres capturas de Qualtrim como referencia. No son el diseño a copiar (Huntr tiene su propio sistema), pero sí definen **qué debe poder producir** el builder y qué detalles hacen que un gráfico se vea profesional.

### Ref. 1 — "Google, Amazon, Microsoft, Meta Revenue" (barras apiladas, 4 tickers, trimestral 2009→2025)

- Fondo crema cálido (≈`#FFFBEF`), rejilla vertical y horizontal muy tenue, sin ejes dibujados.
- Título centrado, 26 px semibold; leyenda **encima** del gráfico, centrada, con cuadrados de color y texto `TICKER - Rev`.
- Eje Y compacto (`$1.8t`, `$720b`), etiqueta de eje rotada ("Revenue"). Eje X con etiquetas de periodo rotadas 45° cada ~3 trimestres.
- Barras sin radio, gap fino (~12 %), orden de apilado estable (GOOG abajo → MSFT arriba).
- Marca de agua "Powered by QUALTRIM" abajo a la derecha, fuera del área de trazado.
- Lección: la alineación entre empresas es por **trimestre natural**, no fiscal (MSFT cierra en junio, GOOG en diciembre y aun así comparten columna).

### Ref. 2 — "NFLX, SPOT - Stock Price" (líneas, indexado a 0 %)

- Fondo blanco puro, proporción cuadrada (1:1), líneas de 2.5 px sin puntos, sin área.
- Eje Y en `+250%` … `-100%` con la etiqueta "Indexed to Zero (%)"; ticks X por semestre (`Jul '21`, `Jan '22`).
- Leyenda arriba con guion de color (`— NFLX - Price`).
- Lección: el indexado necesita **fecha base elegible** (el primer punto del rango) y un formateador de % con signo.

### Ref. 3 — "Netflix - FCF/share vs. Price" (combo doble eje, tema oscuro)

- Fondo azul marino (`#1B2436`), barras rojas por trimestre (FCF/share, eje **derecho**), línea blanca diaria del precio (eje **izquierdo**).
- **Etiquetas de valor** en el primer y último punto de cada serie (`$0.03` → `$2.60`, `$53.35` → `$74.79`) en pastillas negras con texto blanco; es el detalle que más "profesional" hace la imagen.
- Las barras son anchas (≈70 % del hueco) y se sitúan en el **centro del trimestre**; la línea es continua entre ellas, lo que exige un eje X de **tiempo** (numérico) y no categórico.
- Lección: combos de flujo trimestral + precio diario → `ComposedChart` con `XAxis type="number" scale="time"` y dos `YAxis` (`yAxisId="left" | "right"`).

### Lo que Huntr conserva y lo que cambia

| Conservar | Cambiar |
|---|---|
| Título + leyenda encima, marca de agua fuera del plot | Tipografía: Outfit para título/leyenda, Geist Mono tabular para ticks y etiquetas de valor |
| Etiquetas de valor primero/último con pastilla | Pastilla con `wolf-surface`/`snow-peak` y borde `wolf-border`, radio 6 px, no negro puro |
| Tres temas de lienzo: oscuro, claro y crema | Oscuro = Wolf (`#0B1416` / `#162225`), no marino; crema ("Parchment") como tercer preset explícito para exportar |
| Alineación por trimestre natural | Paleta de series propia (ver § 4.5), sin rojo/verde bursátil por defecto — la regla anti-convencional de `DESIGN_SYSTEM.md` |
| Proporciones 16:9 y 1:1 | Marca de agua: wordmark "HUNTR" del sidebar + `huntrvalue.me` |

---

## 3. Principios de interacción (los que deciden el "feel")

Traducción de las pautas de diseño de Apple a este builder; cada uno mapea a una decisión concreta en § 4.

1. **Respuesta inmediata.** Cambiar color, forma, tema o etiqueta se refleja en el lienzo en el mismo frame: todo el estilo vive en estado React local y el `ChartSpec` no toca red. Solo añadir un ticker o cambiar de periodo dispara fetch, y mientras llega, la serie nueva aparece como línea punteada gris ("fantasma") en la leyenda, no como spinner que bloquea.
2. **Manipulación directa.** El lienzo es un objeto, no una vista: clic en un ítem de la leyenda selecciona la serie (el inspector salta a ella); `Alt`+clic la aísla; arrastrar ítems de leyenda reordena el apilado; el título se edita *in place* (contenteditable controlado), no en un formulario aparte.
3. **Interrumpible y sin bloqueos.** Ninguna transición bloquea la entrada. Los paneles laterales son `motion.div` con `type: "spring", bounce: 0, duration: 0.35` (amortiguación crítica); en móvil el panel inferior es una hoja arrastrable con proyección de momento (`project(v)`), umbral de 10 px y cierre por signo de velocidad, no por posición.
4. **Consistencia espacial.** El panel que entra por la derecha sale por la derecha; el inspector de una serie se abre desde su fila (transform-origin en la fila); el diálogo de exportación se origina en el botón "Export".
5. **Simplicidad, no minimalismo.** El camino común (elegir plantilla → cambiar tickers → exportar) son tres clics. Todo lo demás (transformaciones, ejes, formato, radios) está un nivel más abajo, en el inspector de serie o en "Design", nunca en la primera pantalla.
6. **Craft.** Nada aleatorio: los 8 colores de serie están validados a ≥ 3:1 sobre los tres lienzos (ver § 4.5), la rejilla usa el mismo `strokeOpacity={0.4}` que el resto de Huntr, el tracking del título es `-0.02em` como en los `h1` existentes, `prefers-reduced-motion` desactiva animaciones de Recharts (`isAnimationActive={!prefersReducedMotion}`, patrón de `metric-chart-card.tsx:445`) y los springs de panel pasan a cross-fade de 160 ms.
7. **Agencia y perdón.** Deshacer/rehacer (`⌘Z` / `⇧⌘Z`) sobre el historial de `ChartSpec` (pila de 50). Borrar una serie no pide confirmación: se puede deshacer. Solo borrar un gráfico guardado pide confirmación.
8. **Wayfinding.** La cabecera responde a "¿dónde estoy?" (nombre editable del gráfico + "Unsaved"/"Saved · hace 2 min"), "¿adónde puedo ir?" (My charts, Templates) y "¿cómo salgo?" (breadcrumb `Chart Builder`).

---

## 4. Arquitectura

### 4.1 El modelo: `ChartSpec` (fuente de verdad única, serializable)

Todo el builder gira alrededor de un objeto JSON puro y versionado. La UI lo edita, el resolver lo convierte en datos, el lienzo lo pinta, la URL lo codifica y Supabase lo guarda. **Nunca** hay estado de estilo fuera de él.

```ts
// src/lib/chart-builder/spec.ts
export const CHART_SPEC_VERSION = 1 as const;

export type SeriesShape = "bar" | "line" | "area";
export type SeriesAxis = "left" | "right";
export type SeriesTransform =
  | "raw"          // valor tal cual
  | "per_share"    // ÷ shares_outstanding_diluted del mismo periodo
  | "ttm"          // suma móvil de 4 trimestres (solo flujos, solo quarterly)
  | "yoy"          // % vs. mismo periodo del año anterior
  | "indexed";     // % desde el primer punto visible (precio y stocks)

export interface ChartSeries {
  id: string;                 // crypto.randomUUID().slice(0, 8), generado en cliente
  ticker: string;             // "AAPL"
  metric: MetricId;           // ver § 4.2
  transform: SeriesTransform;
  shape: SeriesShape;
  axis: SeriesAxis;
  color: string;              // hex; por defecto, paleta por índice
  label?: string;             // override del "AAPL · Revenue"
  hidden?: boolean;           // sigue en leyenda, no se pinta (toggle rápido)
}

export type Granularity = "annual" | "quarterly";   // para métricas de estados
export type CanvasTheme = "wolf" | "snow" | "parchment";
export type AspectRatio = "16:9" | "4:3" | "1:1";
export type ValueLabels = "none" | "last" | "ends" | "all";
export type LegendPosition = "top" | "bottom" | "hidden";
export type AxisFormat = "auto" | "currency" | "percent" | "number";

export interface ChartStyle {
  theme: CanvasTheme;
  aspect: AspectRatio;
  legend: LegendPosition;
  grid: boolean;
  valueLabels: ValueLabels;
  stacked: boolean;           // afecta solo a shape === "bar"
  barRadius: 0 | 2 | 4;
  lineWidth: 1.5 | 2 | 2.5;
  watermark: boolean;         // no hay "areaFill": `area` es una forma propia (línea + relleno), `line` solo trazo
  yLeftFormat: AxisFormat;
  yRightFormat: AxisFormat;
}

export interface ChartSpec {
  v: typeof CHART_SPEC_VERSION;
  title: string;
  subtitle?: string;
  granularity: Granularity;
  align: "common" | "all";    // common = solo periodos que todas las series tienen (evita columnas huérfanas cuando una empresa ya presentó un trimestre y las demás no)
  range: { from: string | null; to: string | null };   // ISO date o null = todo
  series: ChartSeries[];      // máx. 8
  style: ChartStyle;
}
```

Reglas del modelo (se validan en `validateSpec(spec): SpecIssue[]`, función pura con tests):

- Máximo 8 series y **4 tickers** distintos (cada empresa es una fuente de datos que consultar; cuatro basta para comparar y mantiene a raya las llamadas a Alpha Vantage).
- `ttm` solo con `granularity: "quarterly"` y métricas de tipo `flow`.
- `per_share` solo con métricas de estados (no con `price`).
- `indexed` fuerza `shape: "line"` y ese eje pasa a `percent`.
- Si alguna serie usa `metric: "price"`, el eje X es de tiempo (§ 4.3 paso 7); si no, categórico por periodo natural.
- `stacked` solo apila series `bar` del **mismo eje**; series de ejes distintos nunca se apilan.
- Versionado: al cargar un spec con `v` menor que la actual se pasa por `migrateSpec()`; con `v` mayor se rechaza con mensaje ("Este gráfico se creó con una versión más nueva").

### 4.2 Registro de métricas

Un único catálogo declarativo del que salen el menú de métricas, el formateador, la unidad del eje y el acceso a datos. Añadir una métrica = añadir una entrada.

```ts
// src/lib/chart-builder/metrics.ts
export type MetricUnit = "currency" | "shares" | "per_share" | "percent" | "price";
export type MetricKind = "flow" | "stock" | "ratio" | "price";

export interface MetricDef {
  id: MetricId;
  label: string;              // "Revenue"
  short: string;              // "Rev" (leyenda compacta, como en la ref.)
  group: "Income" | "Cash flow" | "Balance" | "Per share" | "Margins" | "Market";
  unit: MetricUnit;
  kind: MetricKind;
  /** Devuelve el valor para un periodo o null si no aplica. */
  read: (p: PeriodBundle) => number | null;
}

/** Un periodo con las tres cuentas alineadas por fecha (ver resolver). */
export interface PeriodBundle {
  date: string;               // period end, ISO
  period: string;             // "FY2024" | "Q3 2024" (etiqueta fiscal original)
  income?: IncomeStatement;
  balance?: BalanceSheet;
  cashflow?: CashFlowStatement;
}
```

Catálogo v1 — **49 métricas** en `metrics.ts`, agrupadas en `Income`, `Cash flow`, `Balance`, `Per share`, `Margins & returns` y `Market`. Las de `statements` leen campos de `src/types/financials.ts` (salidas de caja como CapEx, dividendos y recompras en valor absoluto, porque las fuentes discrepan en el signo); las de `market` se derivan en el resolver como *precio al cierre del periodo × / ÷ magnitud TTM* usando el histórico diario (`fetchBatchDailyHistory`, 10 años), y por eso solo existen donde llega el precio:

| group | ids |
|---|---|
| Income | `revenue`, `cost_of_revenue`, `gross_profit`, `operating_expenses`, `operating_income`, `ebitda`, `pre_tax_income`, `income_tax`, `net_income` |
| Cash flow | `operating_cash_flow`, `capex`, `free_cash_flow`, `dividends_paid`, `share_repurchases`, `shareholder_returns`, `net_change_in_cash` |
| Balance | `cash_and_equivalents`, `total_cash`, `long_term_debt`, `net_debt`, `total_assets`, `total_liabilities`, `total_equity`, `retained_earnings` |
| Per share | `eps_diluted`, `eps_basic`, `fcf_per_share`, `book_value_per_share`, `shares_outstanding_diluted` |
| Margins & returns | `gross_margin`, `operating_margin`, `net_margin`, `fcf_margin`, `payout_ratio`, `roe`, `debt_to_equity` |
| Market | `price`, `market_cap`, `enterprise_value`, `pe_ttm`, `price_to_sales`, `price_to_book`, `price_to_fcf`, `ev_to_ebitda`, `earnings_yield`, `fcf_yield`, `dividend_yield`, `buyback_yield`, `shareholder_yield` |

**Forward P/E queda fuera a propósito**: una serie histórica necesita el consenso de BPA a 12 meses *en cada fecha pasada* y ninguna fuente del repo lo tiene (`EarningsInsight.est_eps` es solo el próximo trimestre). Si se quiere, la opción honesta es un valor puntual "P/E forward hoy" como línea de referencia en el lienzo, no una serie; decisión del usuario.

### 4.3 El resolver (puro, testeado)

`resolveChart(spec, inputs): ResolvedChart` convierte spec + datos crudos en lo que Recharts pinta. Es una función pura sin React, en `src/lib/chart-builder/resolve.ts`, con tests en `src/lib/chart-builder/__tests__/resolve.test.ts` (vitest incluye `src/**/*.test.ts`, entorno node — ver `vitest.config.ts`).

```ts
export interface ResolveInputs {
  financials: Record<string, CompanyFinancials | null>;         // por ticker
  prices: Record<string, Array<{ date: string; close: number }>>; // por ticker
}

export interface ResolvedPoint { x: number; [seriesId: string]: number | null }
export interface ResolvedChart {
  xMode: "category" | "time";
  points: ResolvedPoint[];      // ordenados por x asc
  xLabels?: Record<number, string>;   // solo category: índice → "Q3 2024"
  series: Array<ChartSeries & { unit: MetricUnit; firstPoint?: ResolvedPoint; lastPoint?: ResolvedPoint }>;
  axes: { left: MetricUnit | null; right: MetricUnit | null };
  warnings: string[];           // "MSFT: solo 4 trimestres disponibles"
}
```

Pasos internos (cada uno es una función exportada y testeable):

1. `bundlePeriods(fin, granularity)` — une income/balance/cashflow por `date` (no por `period`, porque las etiquetas fiscales difieren entre fuentes) → `PeriodBundle[]` ordenados asc.
2. `toCalendarBucket(date, granularity)` — `"2024-09-28"` → `{ key: 2024*4+2, label: "Q3 2024" }` para quarterly, `{ key: 2024, label: "2024" }` para annual. Este `key` es el `x` categórico. Así GOOG (dic) y MSFT (jun) caen en la misma columna, como en la ref. 1. **Nota fiscal**: el año natural del bucket anual es el año de la fecha de cierre; una FY que cierra en enero de 2025 cae en 2025. Se documenta en un tooltip del eje ("Periodos alineados por trimestre natural").
3. `applyTransform(values, transform, ctx)` — sobre la secuencia ordenada de una serie: `per_share` divide por `shares_outstanding_diluted` del mismo bundle; `ttm` suma los 4 últimos (los tres primeros puntos → `null`); `yoy` compara con el bucket 4 posiciones atrás (quarterly) o 1 (annual), `null` si el anterior es ≤ 0; `indexed` = `(v / v0 - 1) * 100` con `v0` el primer valor no nulo **dentro del rango**.
4. `alignSeries(seriesValues[])` — unión de todos los `x`; cada serie rellena con `null` donde no tiene dato (Recharts corta la línea con `connectNulls={false}`; documentar).
5. `applyRange(points, range)`.
6. `pickAxisUnits(series)` — si dos series del mismo eje tienen unidades distintas (currency vs percent) → warning y se mueve la segunda al otro eje automáticamente si está libre; si no, se deja y el eje se formatea como `number`.
7. Modo tiempo: si hay `price`, `x` = epoch ms del cierre; las series de estados se colocan en el **punto medio del bucket** (para que la barra quede centrada en el trimestre, como en la ref. 3); `barSize` se calcula en el render a partir del ancho / nº de buckets visibles.
8. `firstPoint/lastPoint` por serie para las etiquetas de valor.

Casos de test mínimos (uno por fila; usar fixtures pequeñas escritas a mano, no datos reales):
- bundle por fecha con income y cashflow en la misma fecha → un bundle; con fechas distintas → dos bundles (warning).
- bucket trimestral de AAPL FY Q4 (`2024-09-28`) → `Q3 2024`.
- `ttm` con 6 trimestres → 3 nulls + 3 valores correctos.
- `yoy` con base negativa → null.
- `indexed` respeta `range.from`.
- alineación GOOG(dic)/MSFT(jun) anual → misma clave de año.
- `per_share` con `price` → `validateSpec` devuelve issue, resolver ignora la transformación.
- modo tiempo: barras en punto medio del trimestre, precio diario intacto.

### 4.4 Datos: hooks, sin tocar `src/lib/api/**`

`useChartData(spec)` en `src/hooks/use-chart-data.ts`:

```ts
const tickers = uniqueTickers(spec.series);
const needsFinancials = spec.series.some(s => s.metric !== "price");
const needsPrices = spec.series.some(s => s.metric === "price");

const financialQueries = useQueries({
  queries: tickers.map(t => ({
    queryKey: [...QUERY_KEYS.FINANCIALS(t), spec.granularity],   // misma clave que useFinancials → cache compartida con /symbol
    queryFn: () => fetchCompanyFinancials(t),
    staleTime: STALE_TIMES.FINANCIALS,
    enabled: needsFinancials,
  })),
});
const prices = useBatchDailyHistory(tickers, "ALL", needsPrices);
```

- Reutilizar exactamente las `queryKey` existentes para que un ticker abierto antes en `/symbol/AAPL` ya esté en caché.
- `fetchCompanyFinancials` devuelve **anual y trimestral a la vez** (`CompanyFinancials` trae ambos); la granularidad se elige en el resolver, no en el fetch. La clave incluye `granularity` solo por compatibilidad con `useFinancials` (que hace lo mismo hoy).
- El resolver se ejecuta en `useMemo` sobre `[spec, dataSnapshot]`. Con ≤ 8 series y ≤ 80 buckets es < 1 ms; no hace falta worker.
- Estados: `isPending` por ticker → la serie se pinta como fantasma; `null` (ticker sin estados) → warning en la leyenda ("Sin datos financieros para X") y la serie se omite del lienzo sin romper el resto.

### 4.5 Render: `ChartCanvas`

`src/components/chart-builder/chart-canvas.tsx` — un único `ComposedChart` de Recharts que cubre los tres casos:

- `<Bar>` por serie `bar` (`stackId={style.stacked ? series.axis : undefined}`, `radius={[r, r, 0, 0]}`, `isAnimationActive={!reducedMotion}`), `<Line>` para `line` (`dot={false}`, `strokeWidth={style.lineWidth}`), `<Area>` para `area` con el gradiente de `src/components/charts/area-chart.tsx` (`stopOpacity 0.3 → 0`).
- `<XAxis>`: modo category → `dataKey="x" type="category"` con `tickFormatter={i => xLabels[i]}` e `interval="preserveStartEnd"` + `minTickGap={24}`; modo tiempo → `type="number" scale="time" domain={["dataMin","dataMax"]}` y `tickFormatter` con `Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" })` (`Jul '21`, como la ref. 2).
- Dos `<YAxis yAxisId="left"|"right">`; el derecho solo se monta si `axes.right !== null`. Formateadores por unidad: `currency` → `formatCurrency(v, { compact: true })` de `src/lib/utils.ts` (`$1.8t`), `percent` → `+12.3%` con signo, `per_share` → 2 decimales, `shares` → compacto.
- `<Tooltip content={<ChartTooltip … />}>` reutilizando `src/components/charts/chart-tooltip.tsx`; `cursor` = línea vertical `stroke: c.grid` (los cards actuales usan `cursor={false}`; aquí sí hace falta porque hay varias series).
- Etiquetas de valor (`style.valueLabels`): componente `EndLabel` renderizado con `<Customized>` de Recharts: pastilla `rx=6`, fondo `theme.labelBg`, texto mono 11 px, colocada a la derecha del último punto y a la izquierda del primero, con `clamp` para que no salga del plot. Con `"all"` se usa `<LabelList>` estándar solo en barras.
- Leyenda y título **no** son de Recharts: son HTML propio encima del gráfico (`ChartLegend`, `ChartTitle`) para poder hacerlos interactivos (§ 3.2) y editables. La marca de agua es HTML abajo a la derecha.
- Tema del lienzo: `CANVAS_THEMES: Record<CanvasTheme, CanvasTokens>` en `src/lib/chart-builder/themes.ts` — `bg`, `plotBg`, `grid`, `tick`, `title`, `legendText`, `labelBg`, `labelText`. `wolf` copia los valores de `useChartColors()` en oscuro; `snow` los de claro; `parchment` = `bg #FFFBEF`, `grid #E6E0CC`, `tick #5E5A4E`, `title #1B1B1B`. El lienzo se pinta con estos tokens **independientemente** del tema de la app (es un artefacto exportable), pero el chrome del builder (paneles, botones) sigue el tema de la app.
- Paleta de series por defecto (`SERIES_PALETTE`, 8 colores, en orden de asignación): `#FF8C42` sunset, `#4DA3FF` azul, `#FFBF69` golden, `#7C8CF8` índigo, `#34D399` menta, `#F472B6` rosa, `#A3B2B8` mist claro, `#C9A227` ocre. Antes de fijarla, el ejecutor debe comprobar que las 8 dan ≥ 3:1 como **color de trazo** sobre los tres `bg` (WCAG 1.4.11, no-texto) y que `legendText` da ≥ 4.5:1 en los tres temas; si alguna falla en `parchment` (probable con golden y mist claro), oscurecerla solo en ese tema mediante `seriesOverrides` en `themes.ts`, no cambiar la paleta global. Los swatches del inspector muestran estos 8 + un `<input type="color">` "Custom".
- Todo el componente se importa con `next/dynamic` y `ssr: false` desde la página, con un `loading` que reproduce el aspecto del lienzo (bloque con `Skeleton` del alto correcto según `aspect`), para que el LCP y el CLS de la ruta sigan el estándar fijado en la fase 4 de rendimiento.

### 4.6 Persistencia: URL primero, Supabase después

- **URL** (`?c=<base64url(JSON.stringify(spec))>`): un spec típico pesa 400–900 bytes → ~1.2 KB en URL, aceptable sin compresión ni dependencias. Se actualiza con `router.replace` **debounced a 400 ms** y `{ scroll: false }`; leer la URL solo al montar. Un enlace compartido abre el builder con el gráfico listo sin cuenta.
- **Supabase** (fase 3): tabla `user_charts` — migración `supabase/migrations/009_user_charts.sql` copiando literalmente la estructura de RLS y trigger de `006_user_dcf_scenarios.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.user_charts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  spec        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_charts_user_updated ON public.user_charts (user_id, updated_at DESC);
-- + ENABLE ROW LEVEL SECURITY, 4 políticas *_own, trigger set_updated_at: idénticos a 006 cambiando el nombre de tabla
```

  Hook `useSavedCharts()` en `src/hooks/use-saved-charts.ts` clonando `use-dcf-scenarios.ts` (query + `save`, `rename`, `remove` con invalidación). Límite 50 por usuario comprobado en cliente; si no hay usuario, `openGate("charts")` — añadir la razón `"charts"` a `AuthGateReason` y su copy en `REASON_COPY` (`src/providers/auth-gate-provider.tsx:17`).

### 4.7 Exportar PNG (sin dependencias)

`exportChartPng(container, spec, theme, scale = 2)` en `src/lib/chart-builder/export.ts`:

1. Crear `<canvas>` de `W×H` según `aspect` × `scale`; pintar `theme.bg`.
2. Título y subtítulo con `ctx.fillText` (las fuentes cargadas por `next/font` **sí** están disponibles para canvas 2D; usar `getComputedStyle(titleEl).fontFamily`).
3. Leyenda: dibujar swatch + texto por serie visible, centrada.
4. Gráfico: tomar el `<svg>` de Recharts, clonarlo, **incrustar las fuentes** para que los ticks no caigan a serif: recorrer `document.styleSheets` → `CSSFontFaceRule` cuya `fontFamily` coincida con la de Outfit/Geist Mono → `fetch(url)` (mismo origen, `/_next/static/media/*.woff2`) → base64 → `<style>@font-face{…}</style>` dentro del clon. Serializar con `XMLSerializer`, `new Image()` con `data:image/svg+xml`, `drawImage` bajo la leyenda.
5. Marca de agua: wordmark + `huntrvalue.me` en `theme.tick`, abajo a la derecha.
6. `canvas.toBlob("image/png")` → `URL.createObjectURL` → `<a download="huntr-<slug(title)>.png">`. Además "Copy image" con `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])` envuelto en try/catch (Safari/Firefox restringen).

Escape hatch: si en el paso 4 no se encuentra la regla `@font-face` (Next puede inyectarla de otra forma en el futuro), el clon usa `font-family: ui-monospace, Menlo, monospace` para los ticks y se registra un `console.warn` una sola vez. No bloquear la exportación por esto.

### 4.8 Anatomía de la pantalla

Escritorio (≥ 1024 px):

```
┌─ Topbar (existente) ─────────────────────────────────────────────────────┐
├─ Cabecera de página ─────────────────────────────────────────────────────┤
│ [icon] Chart Builder                         [My charts ▾] [Templates]    │
│        COMPOSE, COMPARE, EXPORT              [Undo][Redo]  [Share] [Export]│
├────────────┬──────────────────────────────────────────────┬───────────────┤
│ SERIES     │  Título editable                              │ DESIGN        │
│ (280 px)   │  ■ GOOG · Rev  ■ AMZN · Rev  ■ META · Rev …   │ (264 px)      │
│            │                                               │               │
│ + Add      │  ┌──────────────────────────────────────┐     │ Theme  ○●○    │
│ ─────────  │  │                                      │     │ Aspect 16:9   │
│ ● GOOG Rev │  │           lienzo (aspect)            │     │ Legend  top   │
│   bar·left │  │                                      │     │ Grid    on    │
│ ● AMZN Rev │  │                                      │     │ Labels  ends  │
│ …          │  └──────────────────────────────────────┘     │ Stacked on    │
│            │  Annual | Quarterly      Range ▸ 2009 – 2025  │ Bars   radius │
│            │                                   huntrvalue.me│ Lines  width  │
└────────────┴──────────────────────────────────────────────┴───────────────┘
```

- **Series (izquierda)**: lista ordenable (arrastre con Pointer Events + `setPointerCapture`, umbral 10 px; teclado `Alt+↑/↓`). Cada fila: swatch, `TICKER · Metric`, chips pequeños `bar · left · TTM` solo cuando se alejan del valor por defecto. Clic → se expande *en su sitio* el inspector de esa serie (ticker con el input de búsqueda de `dcf-ticker-input.tsx`, `SelectMenu` de métrica agrupado por `group`, transform, shape, axis, color). Una fila expandida a la vez.
- **Lienzo (centro)**: ocupa el resto; `aspect-ratio` CSS según `style.aspect`; `max-width` para que 1:1 no desborde en alto. Debajo, `SegmentedTabs` Annual/Quarterly y un selector de rango (dos `<input type="month">` estilizados; suficiente en v1).
- **Design (derecha)**: opciones globales, todas con efecto inmediato. El primer grupo, **Data**, edita las series en bloque — métrica, transformación y forma son casi siempre iguales en una comparativa, así que se fijan una vez aquí (con estado "Mixed" cuando difieren) y el inspector de serie queda para las excepciones (combos). Ahí viven también **Periods** (`align`) y el botón **Load 20-year history**. Alpha Vantage no tiene endpoint por métrica — el grano más fino es el estado (`INCOME_STATEMENT`, `BALANCE_SHEET`, `CASH_FLOW`) — así que el builder pide **solo los estados que leen las métricas del gráfico** (`statementsFor(spec)`, declarado por métrica en `metrics.ts`): EBITDA de cinco empresas = 5 llamadas, no 15–20. Ruta: `fetchAlphaStatements(ticker, statements, cachedOnly)` → `getAlphaStatements` en `src/lib/api/alphavantage.ts` (caché por estado `alpha-<kind>-v1`, 12 h / 7 d; un bundle completo `financials-alpha-v2` ya cacheado responde a cualquier subconjunto). Lo cargado va a una clave de React Query **propia** (`["chart-builder","deep",ticker,estados]`) y `mergeFinancials` lo superpone estado a estado sobre los datos rápidos de Yahoo — nunca se escribe un objeto parcial bajo la clave compartida `FINANCIALS(ticker)` que leen la ficha, dividendos y el DCF. Al abrir el builder, la misma acción con `cachedOnly: true` recoge gratis lo que ya esté en caché de servidor. Gate `deepData` para invitados, secuencial por ticker, se detiene al primer límite; `align: common` mantiene consistentes las empresas que sigan en Yahoo. Sin acordeones anidados; grupos separados por 24 px y un `text-[10px] uppercase tracking-[0.11em] text-mist/85` como en los cards existentes.
- **Cabecera**: mismo bloque `h1` + caption que `dcf-calculator/page.tsx:1168-1173` (icono en `bg-sunset-orange/10`, `tracking-[-0.02em]`, caption `text-[10px] uppercase tracking-[0.09em]`).

Móvil (< 1024 px): cabecera compacta, lienzo a ancho completo arriba (1:1 o 4:3 forzado en pantalla; el `aspect` del spec se respeta solo al exportar), y una **hoja inferior** con `SegmentedTabs` `Series | Design` que se arrastra entre dos puntos (peek 96 px / 70 % alto). Implementarla con framer-motion `drag="y"`, `dragConstraints`, y en `onDragEnd` decidir por `velocity.y` y proyección (`current + (v/1000)·0.998/(1−0.998)`), spring `bounce: 0.15` **solo** en esa hoja (viene de un gesto con momento), `bounce: 0` en todo lo demás.

Estado vacío (primera visita): **solo un buscador** ("Add a company to start"). Ninguna empresa entra en el gráfico — y ninguna fuente se consulta — hasta que el usuario la nombra; las plantillas reordenan las empresas que ya están en el gráfico y nunca añaden una. Debajo del lienzo, en lugar de dos inputs de mes, un **deslizador de periodos** con un punto por trimestre/año disponible y dos asas (estilo Fiscal.ai); sin rango elegido se muestran los **últimos 10 años** cuando todas las empresas tienen historial Alpha Vantage y los **últimos 5** con datos Yahoo (su máximo), sin escribirlo en el spec para que un enlace compartido siga significando "lo que haya". Vista trimestral por defecto. Plantillas (`src/lib/chart-builder/templates.ts`, cada una un `ChartSpec` completo):

| id | Título | Series | Estilo |
|---|---|---|---|
| `revenue-race` | Revenue — big tech | revenue × 4 tickers, bar, stacked, quarterly | parchment, legend top |
| `price-indexed` | Price, indexed | price × 2, line, indexed | snow, 1:1, labels ends |
| `fcf-vs-price` | FCF/share vs. price | free_cash_flow per_share bar right + price line left | wolf, labels ends |
| `margins` | Margins | gross/operating/net margin × 1 ticker, line | wolf, percent axis |
| `capital-returns` | Capital returned | dividends_paid + share_repurchases, bar stacked, annual | wolf |

Los tickers por defecto de las plantillas se leen de la watchlist del usuario si existe (`fetchDefaultWatchlistTickers`, `src/app/actions/stock.ts:179`), y si no, de una constante (`["AAPL","MSFT","GOOGL","AMZN"]`).

### 4.9 Rendimiento y accesibilidad (criterios que heredan de las fases 4 y 5)

- Recharts, el lienzo y el exportador van en chunks diferidos; el primer paint de `/app/chart-builder` no debe incluir Recharts. Verificación: `rm -rf .next && npx next experimental-analyze -o` → `.next/diagnostics/route-bundle-stats.json` → `firstLoadUncompressedJsBytes` de la ruta ≤ 1 000 000 (el DCF, con el mismo patrón, está en 1034 KB tras la fase 4; la referencia sin Recharts es `/app/screener`).
- Skeleton del lienzo con el mismo `aspect-ratio` → CLS < 0.1 en la ruta.
- Todos los botones de icono con `aria-label`; la lista de series es un `role="list"` con reordenación por teclado anunciada con `aria-live="polite"`; contraste ≥ 4.5:1 en texto de leyenda en los tres temas; foco visible (`focus-visible:ring-2 ring-sunset-orange/60`, como en `button.tsx`).
- `prefers-reduced-motion`: sin animación en Recharts, springs → fade 160 ms, hoja móvil sin rebote.
- Lighthouse local (misma receta que las fases 4/5: `next build && next start -p 3100`, matar el listener de 3100 antes de reconstruir): perf ≥ 70 móvil, a11y ≥ 95 en `/app/chart-builder` con un spec de plantilla en la URL.

---

## 5. Ficheros

Nuevos (todos fuera de `src/lib/api/**` y `src/lib/calculations/**`, que no se tocan):

```
src/lib/chart-builder/
  spec.ts             tipos + validateSpec + migrateSpec + defaultSpec
  metrics.ts          METRICS catálogo + MetricId
  resolve.ts          bundlePeriods, toCalendarBucket, applyTransform, alignSeries, resolveChart
  themes.ts           CANVAS_THEMES, SERIES_PALETTE
  templates.ts        TEMPLATES
  url.ts              encodeSpec / decodeSpec (base64url, try/catch)
  export.ts           exportChartPng, copyChartPng
  __tests__/resolve.test.ts
  __tests__/spec.test.ts
  __tests__/url.test.ts
src/hooks/
  use-chart-data.ts
  use-chart-history.ts    undo/redo sobre ChartSpec (pila 50, coalescing de cambios de color a 300 ms)
  use-saved-charts.ts     (fase 3)
src/components/chart-builder/
  chart-canvas.tsx        Recharts ComposedChart (dynamic, ssr:false)
  chart-legend.tsx        leyenda HTML interactiva
  chart-title.tsx         título/subtítulo editables in place
  end-labels.tsx          pastillas de valor (Customized)
  series-panel.tsx        lista + inspector
  series-row.tsx
  series-inspector.tsx
  design-panel.tsx
  range-picker.tsx
  template-gallery.tsx
  export-dialog.tsx
  mobile-sheet.tsx        hoja inferior con momento
  saved-charts-menu.tsx   (fase 3)
src/app/(platform)/app/chart-builder/
  page.tsx                orquesta: spec state + history + url + data
  loading.tsx             skeleton de la página
supabase/migrations/009_user_charts.sql   (fase 3)
```

Modificados:

- `src/lib/constants.ts` — `ROUTES.APP_CHART_BUILDER = "/app/chart-builder"`.
- `src/components/layout/sidebar.tsx` y `mobile-sidebar.tsx` — ítem "Chart Builder" con icono `ChartColumnStacked` (o `BarChart3`) de lucide, entre "DCF Calculator" y "Portfolios". El array `mainNav` está en `sidebar.tsx:45`; cada entrada es `{ label, href, icon }`.
- `src/providers/auth-gate-provider.tsx` — razón `"charts"` (fase 3).
- `src/components/charts/expand-chart-dialog.tsx` — botón "Open in Chart Builder" que construye un spec de una serie y navega (fase 3). Es el único cambio a un componente existente; añadir una prop opcional `builderSpec?: ChartSpec` y no cambiar el comportamiento cuando no se pasa.
- `README.md` — captura `public/screenshots/chart_builder.webp` y una línea en la tabla (al final, con captura real).

---

## 6. Fases y pasos

Referencia visual: `plans/chart-builder-mockup.html` (mockup interactivo de la anatomía, los tres temas y los controles; abrirlo en el navegador).

Cada fase es un PR propio sobre una rama `feat/chart-builder-N`. Antes de cada commit: `npm run lint && npx tsc --noEmit && npm test` en verde (306 tests actuales + los nuevos; si un test existente falla, se revierte el cambio, no el test). Conventional Commits (`feat(chart-builder): …`).

### Fase 0 — Modelo y resolver (sin UI)

1. Crear `spec.ts`, `metrics.ts`, `resolve.ts`, `themes.ts`, `url.ts` con los tipos de § 4.1–4.3 y § 4.6.
2. Escribir los tests de § 4.3 más: `decodeSpec(encodeSpec(x))` deep-equal a `x`, `decodeSpec("garbage")` → `null`, `validateSpec` para cada regla del modelo.
3. Verificar: `npm test` → los nuevos tests pasan; `npx tsc --noEmit` limpio.

Salida: ~600 líneas de lógica pura. No hay nada visible todavía; es la fase que hace el resto barata.

### Fase 1 — MVP visible

4. `ROUTES`, ítem de sidebar, `page.tsx` con estado `spec` (`useState` + `useChartHistory`), lectura de URL al montar y escritura debounced.
5. `useChartData` (§ 4.4) y `ChartCanvas` (§ 4.5) con barras/líneas/áreas, dos ejes, ambos modos de eje X, tooltip y etiquetas de valor. Importado con `dynamic`.
6. `SeriesPanel` con añadir/quitar/reordenar/inspector; `ChartLegend` interactiva; `ChartTitle` editable.
7. `TemplateGallery` como estado vacío y menú "Templates".
8. Skeleton de página y de lienzo con alto estable.
9. Verificar en navegador (preview local): las cinco plantillas pintan con datos reales de tickers cacheados (AAPL/MSFT/GOOGL/AMZN suelen estarlo); combo FCF/share vs. price muestra barras centradas en trimestre y línea diaria; cambiar Annual↔Quarterly no reordena las series; recargar la URL restaura el gráfico.
10. Medir: `experimental-analyze` (≤ 1000 KB first load), Lighthouse local (a11y ≥ 95, CLS < 0.1).

### Fase 2 — Diseño y exportación

11. `DesignPanel` completo (§ 4.1 `ChartStyle`), tres temas de lienzo, swatches + custom color, aspecto.
12. `exportChartPng` + `ExportDialog` (vista previa a escala, botones Download / Copy, selector de escala 1×/2×/3×); botón "Share" copia la URL.
13. Undo/redo con atajos (`useKeyboardShortcut` existe en `src/hooks/use-keyboard-shortcut.ts` — reutilizar).
14. Hoja inferior móvil con momento (§ 4.8) y comprobación a 375 px.
15. Verificar: exportar las 5 plantillas a PNG en los 3 temas y abrir los ficheros — fuentes correctas en ticks, leyenda y marca de agua presentes, sin recortes; Lighthouse a11y ≥ 95 se mantiene.

### Fase 3 — Cuenta y puntos de entrada

16. Migración `009_user_charts.sql`; **aplicarla la hace el usuario** en Supabase (el ejecutor la entrega y documenta el SQL para el editor; nunca la ejecuta contra producción).
17. `useSavedCharts`, menú "My charts" (lista, abrir, renombrar, borrar con confirmación), "Save" en cabecera con estado `Unsaved / Saved · hace N min`.
18. Razón `"charts"` en el gate; botón "Open in Chart Builder" en `ExpandChartDialog` (solo cuando recibe `builderSpec`); pasar `builderSpec` desde `metric-chart-card.tsx` con `{ ticker, metric }` de la tarjeta.
19. Verificar: guardar sin sesión abre el gate; con sesión, guardar/recargar/renombrar/borrar; RLS: una segunda cuenta no ve los gráficos de la primera (probar con dos usuarios de test, no con datos reales de otros).

### Fase 4 — Pulido

20. Fantasmas de carga por serie, warnings de datos en leyenda, `Alt`+clic para aislar serie, atenuación de las demás al pasar el ratón por la leyenda (opacidad 0.25, transición 120 ms).
21. Captura para el README y línea en la tabla.
22. Repetir mediciones de la fase 1 y dejarlas en la descripción del PR.

---

## 7. Criterios de aceptación (verificables)

- [ ] `npm run lint && npx tsc --noEmit && npm test` en verde; nº de tests ≥ 306 + los nuevos de `src/lib/chart-builder/__tests__/`.
- [ ] `git diff --stat main -- src/lib/api src/lib/calculations` vacío en todos los PRs.
- [ ] `/app/chart-builder?c=<spec de fcf-vs-price>` renderiza barras trimestrales centradas y línea diaria de precio en ejes distintos, con etiquetas `ends`.
- [ ] `/app/chart-builder?c=<spec de revenue-race>` alinea GOOG y MSFT en la misma columna trimestral.
- [ ] Exportación PNG 2× de cada plantilla en los tres temas produce ficheros con fuentes Outfit/Geist Mono incrustadas (comprobar visualmente que los ticks no son serif).
- [ ] `route-bundle-stats.json`: `firstLoadUncompressedJsBytes` de `/app/chart-builder` ≤ 1 000 000.
- [ ] Lighthouse móvil local en la ruta con spec: a11y ≥ 95, CLS < 0.1, perf ≥ 70.
- [ ] Con `prefers-reduced-motion: reduce` no hay animación de barras ni springs.
- [ ] Teclado: se puede añadir una serie, cambiar su métrica, reordenarla y exportar sin ratón.
- [ ] (Fase 3) RLS verificada con dos cuentas.

---

## 8. Fuera de alcance (explícito)

- Métricas que dependen de precio × fundamentales en fecha (`market_cap`, `pe_ttm`, `fcf_yield`) — plan aparte.
- Anotaciones libres sobre el lienzo, gráficos de dispersión, velas, log-scale — no en v1 (log-scale es fácil de añadir después como `yLeftScale: "linear" | "log"` en `ChartStyle`; dejar el campo fuera hasta entonces para no versionar de más).
- Compartir gráficos públicamente por id (`/c/<id>`) — requiere política RLS de lectura pública y página OG; después de la fase 3 si se usa.
- Cambios en `src/lib/api/**`, `src/lib/calculations/**`, versiones de `next`/`react`/`tailwindcss`, nuevas dependencias.
- Ejecutar `scripts/` o cualquier cosa que pegue en bloque a Yahoo/Alpha Vantage/Supabase. Las pruebas usan tickers que ya están en caché.

---

## 9. Cuándo parar y preguntar

- Si `fetchCompanyFinancials` devuelve `quarterly` vacío para los tickers de prueba (fallback Yahoo sin trimestrales): parar y decidir con el usuario si el builder oculta "Quarterly" para ese ticker o muestra el aviso; no inventar datos.
- ~~Si Recharts 3.7 no centra las barras en un `XAxis scale="time"`~~ **Resuelto en fase 1**: Recharts 3.7 deriva el ancho de banda del hueco mínimo entre filas (un día con cierres diarios) y `Bar` no acepta `data` propio, así que en modo tiempo las barras se pintan como `ReferenceArea` en coordenadas de datos (centro del bucket ± 36 % del span) y las pastillas de valor como `ReferenceDot` con `label`. Ver `chart-canvas.tsx`.
- Si la incrustación de fuentes en el SVG exportado falla en Chrome **y** Safari: aplicar el fallback de § 4.7 y anotarlo en el PR; no añadir `html2canvas` ni similares.
- Si el chunk de la ruta supera 1000 KB tras aplicar `dynamic`: revisar qué arrastra la página (probablemente `framer-motion` por la hoja móvil → cargar `mobile-sheet.tsx` también con `dynamic` y solo bajo 1024 px) antes de tocar nada más.
- Si `@radix-ui`/`cmdk` parecen necesarios para algún menú: no; `SelectMenu` y `Dialog` propios cubren todo.

---

## 10. Mantenimiento

- **Añadir una métrica** = una entrada en `metrics.ts` + un test en `resolve.test.ts`. Nada más.
- **Cambiar `ChartSpec`** = subir `CHART_SPEC_VERSION`, añadir el caso a `migrateSpec` y un test que cargue un spec de la versión anterior. Los specs viven en URLs compartidas y en `user_charts`; nunca romper la lectura de versiones antiguas.
- **Colores**: `SERIES_PALETTE` y `CANVAS_THEMES` son la única fuente; si el issue #15 (tokens de contraste) cambia `--color-mist` o `--color-bearish`, revisar `themes.ts` para que `wolf`/`snow` sigan espejando `useChartColors()`.
- Qué vigilar en revisión: cualquier `useEffect` que escriba en `spec` (debe ser solo la lectura inicial de la URL), cualquier estado de estilo fuera del spec, y cualquier `fetch` nuevo fuera de `use-chart-data.ts`.

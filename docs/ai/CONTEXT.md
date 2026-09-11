# HUNTR - TECHNICAL CONTEXT

## STACK TECNOLÓGICO
- **Framework:** Next.js 15 (App Router).
- **Styling:** Tailwind CSS + Shadcn/UI (Componentes base).
- **Charts:** Recharts (Configurado para seguir la paleta del Design System).
- **Data Fetching:** TanStack Query (React Query).
- **Database:** Supabase (Auth + Postgres).

## DATA SOURCE (MOCK DATA STRATEGY)
Actualmente no tenemos API de pago. Debes generar un **Servicio de Mock Data** robusto.
- Crea un archivo `src/lib/mock-data.ts`.
- Genera funciones como `getStockProfile(ticker)`, `getFinancials(ticker)`.
- Los datos deben ser realistas (ej: AAPL con trillones de Market Cap, no números aleatorios sin sentido).

## ESTRUCTURA DE RUTAS (NEXT.JS)
- `/` -> Landing Page (Hero section con la imagen del lobo vectorizada o abstracta).
- `/app` -> Dashboard principal (Watchlist).
- `/symbol/[ticker]` -> Página de detalle de la acción (El clon de Qualtrim).
  - Tabs: Overview, Financials, Valuation, Dividends.

## DATA SOURCE: YAHOO FINANCE (vía 'yahoo-finance2')

### LIBRERÍA
- Usaremos el paquete npm: `yahoo-finance2`.
- **Importante:** Todas las llamadas a esta librería DEBEN hacerse en el Servidor (Server Actions o API Routes), nunca en el Cliente.

### ESTRATEGIA DE DATOS (MAPPING)
Yahoo entrega datos crudos. Debemos transformarlos para la UI de Huntr:

1.  **Perfil y Precio:**
    - Método: `yf.quoteSummary(ticker, { modules: ['price', 'summaryProfile', 'summaryDetail'] })`
    - Datos: Market Cap, Beta, Dividendo, Descripción, Sector.

2.  **Estados Financieros (Fundamental Data):**
    - Método: `yf.quoteSummary(ticker, { modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory'] })`
    - *Nota:* Yahoo devuelve objetos anidados. Debemos aplanarlos (flatten) antes de guardarlos en Supabase.

3.  **Ratios de Calidad (Cálculo Manual):**
    - Yahoo no entrega el ROIC directamente.
    - **Cálculo:** Debemos calcularlo en `src/lib/metrics.ts` usando: `(EBIT * (1 - taxRate)) / (Total Stockholder Equity + Total Debt)`.

### CACHÉ (SUPABASE)
Mantener la estrategia "Lazy Fetching".
- Tabla `stock_cache`:
  - `ticker` (PK)
  - `data` (JSONB) -> Aquí guardamos la respuesta completa de Yahoo.
  - `last_updated` (Timestamp).
  - *TTL (Time to Live):* 24 horas.
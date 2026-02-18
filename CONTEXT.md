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
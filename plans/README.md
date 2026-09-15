# Plans

Planes de implementación escritos para que los ejecute otro agente/modelo sin contexto de la sesión en la que se redactaron. Cada plan es autocontenido; el estado se actualiza aquí.

| # | Plan | Estado | Depende de | Escrito contra |
|---|---|---|---|---|
| 001 | [Chart Builder](001-chart-builder.md) | Fase 0 ✓ · fase 1 en PR · fases 2–4 TODO | — | `b54ba8a` |

Orden recomendado dentro de 001: fase 0 → 1 → 2 → 3 → 4, un PR por fase.

Considerado y descartado para 001 (no re-auditar):

- Librerías de exportación (`html2canvas`, `dom-to-image`): el SVG de Recharts + canvas 2D basta y no añade dependencias.
- Compresión de la URL (`lz-string`): el spec cabe en ~1 KB sin ella.
- Un motor de gráficos genérico (Vega-Lite, Plotly): sobredimensionado para cinco tipos de gráfico y rompe la coherencia visual con el resto de Huntr.
- Guardar el gráfico como imagen en Supabase Storage: el spec JSON es más pequeño, editable y re-renderizable; la imagen se genera en cliente al exportar.

# Steady — budget planner (Candy Pop)

React + TypeScript + Vite implementation of `project/Budget Planner Candy Pop.dc.html`.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

Add `?today=2026-09-25` to the URL to pin "today" (the sample data is generated around the current date).

## Layout

- `src/lib/` — pure logic: dates, currencies, sample data, period/left-to-spend maths (`model.ts`), debt payoff simulation (`debt.ts`), theme fonts/backgrounds.
- `src/store.tsx` — app state and actions. Screens read a computed view (live records, balances); changes write records.
- `src/lib/storage.ts` — the only code that touches browser storage: versioned saves, converters between versions, multi-tab safety, backup files.
- `src/screens/` — Home, Bills, Debt, Goals.
- `src/Sheets.tsx` — log spending/income, add/edit forms, Edit budget, Settings.
- `src/Onboarding.tsx` — first-run setup (also "Run setup again").
- `src/theme.css` — Candy Pop colour tokens for light and dark.

## Saved data

- Budget data is saved under `steady.data` as `{ schema, savedAt, data }`; this device's look and layout under `steady.prefs`.
- Money is saved in whole cents. The app rounds headline numbers and shows cents on single transactions, bills and breakdowns.
- Every record has a UUID `id`, `u` (last changed, ms) and, when deleted, `del` (deleted records are kept and hidden).
- Debt balances and goal totals aren't stored: they're an opening/start amount plus separate payment/deposit records.
- **Changing the saved shape:** bump `SCHEMA` in `storage.ts` and add a converter to `MIGRATIONS`. Never edit a released converter. Old data (and old backup files) are upgraded on load; a copy of the previous version is kept.

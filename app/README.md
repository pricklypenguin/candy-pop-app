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
- `src/store.tsx` — app state (persisted to `localStorage`) and actions.
- `src/screens/` — Home, Bills, Debt, Goals.
- `src/Sheets.tsx` — log spending/income, add/edit forms, Edit budget, Settings.
- `src/Onboarding.tsx` — first-run setup (also "Run setup again").
- `src/theme.css` — Candy Pop colour tokens for light and dark.

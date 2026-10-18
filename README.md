# Alpha Factory — live

A live, read-only window into an AI-run software factory.

AI models plan, build, cross-review, merge and test code around the clock to build **Alpha**, a bot that
forecasts the weather and studies Polymarket weather prediction markets. Code written by one AI family
is reviewed by a model from a different family before an automatic integrator merges it; a full test
suite, a watchdog, a flow auditor and an operator AI keep the line moving.

**Live page:** https://heroo2123.github.io/alpha-factory-live/

## What is (and is not) in this repository

- `main` branch: the static page (`index.html`, `app.js`, `style.css`) — no build step, no libraries.
- `data` branch: `snapshot.json`, refreshed about every 5 minutes when something changed. The page reads it
  from the `data` branch, so data updates never rebuild the site.

The snapshot is built by a script on the factory host from an explicit **allowlist** of fields: counts,
stage names, AI model names, short cleaned-up task titles, weather-source names and forecast accuracy
scores. Before every push a leak scanner checks all files for anything secret-shaped and aborts the
push if it finds one.

**Never published:** keys or tokens, wallet addresses, balances or any money figures, trading rules or
thresholds, file paths, host names, specific markets, cities or weather stations.

## No money

Alpha is **unfunded**. Its "Shadow" makes paper decisions only and its trading executor is locked.
Nothing on this page is financial advice.

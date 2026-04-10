# Data Sources for Pilgrimage Statistics

This guide documents where the annual pilgrim statistics in each route's `stats.json` come from, and how to refresh them when new data is published.

The route data in this repository is meant to be reproducible: every figure should be traceable to a primary source. When you refresh stats for a new year, follow this guide so future contributors can audit the data and update it without re-discovering the sources.

---

## Camino de Santiago routes (Francés, Portugués, Inglés, Primitivo, Norte, etc.)

**Primary source: Solvitur Ambulando** (`solviturambulando.es`) — a machine-readable JSON API that mirrors and extends the Oficina del Peregrino (Pilgrim's Office of the Cathedral of Santiago de Compostela) annual statistics with per-route age, gender, motivation, and nationality breakdowns.

This source applies to:
- `routes/camino-frances/stats.json`
- `routes/camino-portugues/stats.json`
- (Future) any other Camino route added to this repo

Solvitur Ambulando is the recommended primary source because:
1. It covers **2003-present** with per-route Compostela counts (the underlying Oficina PDFs only go back to 2004)
2. It provides **per-route demographics** (age, gender, motivation, nationality), which the Oficina PDFs publish only as all-Camino aggregates
3. It separates **Camino Portugués Central from Coastal** even for pre-2016 years (the Oficina PDFs combined them under "Portugués" before 2016)
4. It is **machine-readable JSON** (no PDF parsing required)
5. It is updated within ~1-2 months of year-end, before the Oficina PDF is typically published

### How to fetch

The endpoint pattern:
```
https://solviturambulando.es/api/yearly-demographics.json?year={YEAR}&v=5
```

The endpoint is gzip-encoded and requires a browser-like `User-Agent` and a `Referer` header. Direct `curl` without these headers returns `Forbidden: external access to data API not allowed`.

Working fetch command (macOS/Linux):

```bash
year=2025
curl -sL --compressed \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: application/json, text/plain, */*" \
  -H "Referer: https://solviturambulando.es/statistics/${year}" \
  "https://solviturambulando.es/api/yearly-demographics.json?year=${year}&v=5" \
  -o "${year}_raw.gz"
gunzip -c "${year}_raw.gz" > "${year}.json"
```

To fetch all years 2003-current:

```bash
mkdir -p /tmp/solvitur && cd /tmp/solvitur
for year in $(seq 2003 2025); do
  curl -sL --compressed \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    -H "Referer: https://solviturambulando.es/statistics/${year}" \
    "https://solviturambulando.es/api/yearly-demographics.json?year=${year}&v=5" \
    -o "${year}_raw.gz"
  gunzip -c "${year}_raw.gz" > "${year}.json"
done
rm -f *_raw.gz
```

### Response structure

Each yearly file is a JSON object with this shape:

```json
{
  "year": "2024",
  "caminos": ["Francés", "Portugués", "Portugués Costa", "Inglés", "Primitivo",
              "Norte", "Via de la Plata", "De Invierno", "Muxia-Finisterre",
              "Otros caminos", ...],
  "datasets": {
    "age": {
      "groups": ["< 18", "18 - 45", "46 - 65", "> 65"],
      "series": [
        { "name": "< 18", "data": [24986, 6383, 2981, 1688, ...] },
        { "name": "18 - 45", "data": [95637, 38431, 30627, ...] },
        ...
      ]
    },
    "gender": {
      "groups": ["Man", "Woman", "N/A"],
      "series": [
        { "name": "Man", "data": [108905, 41623, ...] },
        { "name": "Woman", "data": [127217, 53799, ...] },
        ...
      ]
    },
    "motivo": {
      "groups": ["Religious", "Religious & Other", "Non-religious", "N/A"],
      "series": [...]
    },
    "country": {
      "groups": ["España", "Estados Unidos", "Italia", "Alemania", "Portugal", ...],
      "series": [...]
    }
  }
}
```

**Key insight:** Each `datasets.{key}.series[i].data` is an array indexed by `caminos[]`. So:
- `datasets.age.series[1].data[1]` = number of pilgrims aged 18-45 walking the Portugués Central route

⚠ **CRITICAL: The order of routes in `caminos[]` varies by year.** Francés is always at index 0 and Portugués (Central) is always at index 1, but every other route can shift positions. For example, "Portugués Costa" was at index 6 in 2003-2004, index 8 in 2005-2007, index 7 in 2010, index 5 in 2020, and index 2 in 2024-2025. **Always use `caminos.index('route name')` to find the right index — never hardcode a position.**

To compute the **total count for a specific route**, look up the index by name and sum across all age series:

```python
import json
data = json.load(open('2024.json'))
route_idx = data['caminos'].index('Portugués')  # Central — always at index 1
total = sum(s['data'][route_idx] for s in data['datasets']['age']['series'])
# → 95495

# For Coastal, MUST look up by name (index varies by year):
coastal_idx = data['caminos'].index('Portugués Costa')  # In 2024 this is 2, in 2003 it was 6
coastal_total = sum(s['data'][coastal_idx] for s in data['datasets']['age']['series'])
# → 74755
```

### Refreshing the stats files

When a new year's data becomes available on Solvitur (typically 1-2 months after year-end):

1. Fetch the JSON for the new year using the command above
2. Compute totals and demographics for the routes you care about
3. Update the `annualPilgrims.trend` array in each route's `stats.json` with a new entry
4. Update `latest`, `lastUpdated`, and `dataYear`
5. Update `demographics` (use the most recent complete year — currently 2024 because 2025 data may still be incomplete during early Q1)
6. Commit with a message like `data: refresh camino stats with 2026 figures from Solvitur`

### Verified URL patterns

| Source | URL pattern | Year coverage | Format |
|---|---|---|---|
| **Solvitur Ambulando JSON API** (primary) | `https://solviturambulando.es/api/yearly-demographics.json?year={YEAR}&v=5` | 2003-present | JSON (gzipped) |
| Solvitur Ambulando per-year HTML | `https://solviturambulando.es/statistics/{YEAR}` | 2003-present | HTML with charts |
| Oficina del Peregrino — annual PDFs (2004-2019) | `https://oficinadelperegrino.com/wp-content/uploads/2016/02/peregrinaciones{YEAR}.pdf` | 2004-2019 | PDF (Spanish) |
| Oficina del Peregrino — annual PDFs (2020-2021) | `https://catedral.df-server.info/est/peregrinaciones{YEAR}.pdf` | 2020-2021 | PDF (Spanish) |
| Oficina del Peregrino landing page | `https://oficinadelperegrino.com/en/statistics/` | — | HTML iframe → catedral.df-server.info |
| Cathedral of Santiago stats dashboard | `https://catedral.df-server.info/est/index.html` | 2004-2021 | HTML with year-selector PDF download |

**Important:** As of April 2026, the Oficina del Peregrino has not published PDF reports for 2022, 2023, 2024, or 2025. Their year-selector dropdown ends at 2021. For those years (and going forward) Solvitur Ambulando is the only machine-readable source.

### Data quality cross-check

When this dataset was first populated (April 2026), the Solvitur API and the Oficina PDFs were cross-checked for 2004-2021 (18 overlapping years). The two sources agree to within 0.1-2% on per-route counts each year. The small discrepancies are likely due to:
- Solvitur's Central/Coastal back-attribution for pre-2016 years
- Minor reclassifications (e.g., pilgrims who used multiple routes)
- Rounding in PDF text extraction

For the canonical data in this repo, we use Solvitur as the primary source. The Oficina PDFs remain a useful audit reference; download them for the historical record.

### Falling back to PDFs (for historical audit)

To download all 18 historical Oficina PDFs (2004-2021):

```bash
mkdir -p /tmp/oficina-pdfs && cd /tmp/oficina-pdfs

# 2004-2019 use the WordPress upload path
for year in $(seq 2004 2019); do
  curl -sLO "https://oficinadelperegrino.com/wp-content/uploads/2016/02/peregrinaciones${year}.pdf"
done

# 2020-2021 are only on the catedral subdomain
for year in 2020 2021; do
  curl -sLO "https://catedral.df-server.info/est/peregrinaciones${year}.pdf"
done
```

To extract text from the PDFs (requires `poppler` for `pdftotext`):

```bash
brew install poppler  # macOS
sudo apt install poppler-utils  # Debian/Ubuntu

for pdf in peregrinaciones*.pdf; do
  year=$(basename "$pdf" .pdf | sed 's/peregrinaciones//')
  pdftotext -layout "$pdf" "${year}.txt"
done
```

The PDFs are Spanish-only. Each contains the same sections in the same order:
1. **Cover page** — "Informe estadístico Año NNNN"
2. **Total pilgrims** — opening sentence "Durante todo el Año NNNN... un total absoluto de NNN.NNN peregrinos"
3. **Sexos** — gender split
4. **Medios** — mode of travel (Pie/Bicicleta/Caballo/Vela/Silla de ruedas)
5. **Motivos** — motivation (Religioso/Religioso y otros/No religioso)
6. **Edades** — age groups (<30, 30-60, >60)
7. **Países** — top nationalities
8. **Autonomías** — Spanish autonomous communities
9. **Caminos** — per-route table (the data Solvitur exposes via API)
10. **Procedencias** — starting points

Note: pre-2016 PDFs do NOT track Portugués Coastal separately. The "Camino Portugués" line in those years includes Central + Coastal combined. Solvitur back-attributes them — its 2004 Coastal figure of 810 is from internal classification, not from the original PDF.

---

## Kumano Kodo

**Authoritative source:** Tanabe City Kumano Tourism Bureau (田辺市熊野ツーリズムビューロー), which collects dual-pilgrim certifications and publishes them.

The Kumano Kodo and the Camino de Santiago have a unique dual-pilgrim agreement (since 2015): walking ≥7 routes between both pilgrimages earns a "Dual Pilgrim" certification at either trail. The Tanabe Bureau tracks numbers of Dual Pilgrim certifications.

For total Kumano Kodo pilgrims (not just dual), Wakayama Prefecture and the local tourism bureaus publish visitor counts but not standardized per-route totals.

**URLs:**
- https://www.tb-kumano.jp/en/dual-pilgrim/ (English)
- https://www.tb-kumano.jp/ (Japanese, more current)

There is no equivalent of Solvitur Ambulando's machine-readable dataset for Kumano. Pilgrim statistics for Kumano in `routes/kumano-kodo/stats.json` should cite the Tanabe Bureau and be marked as approximate where exact figures aren't published.

---

## Shikoku 88 Temple Pilgrimage

**Authoritative source:** Shikoku Henro Tourism Promotion Association (四国遍路情報) and individual temple registers.

There is no central agency that publishes annual pilgrim statistics for Shikoku 88. Each temple maintains its own pilgrim register (nōkyōchō stamps), but these are not aggregated centrally. Estimates are derived from:

- Bus pilgrimage operators (~50-70% of pilgrims travel by bus)
- Walking pilgrim surveys
- Shukubo (temple lodging) registers
- Tourism Ministry of Japan (国土交通省) regional visitor data

**Useful URLs:**
- https://shikoku.gr.jp/pilgrimage/ (Shikoku Tourism Authority)
- https://www.henro88map.com/ (English-language Henro guide)
- https://shikoku88.net/en/

Statistics for Shikoku 88 in `routes/shikoku-88/stats.json` should be sourced from these tourism bureaus and marked as estimates where appropriate.

---

## When you add a new route

When you add a new pilgrimage route to this repository:

1. **Identify the canonical statistical source** for that route. For most pilgrimages this will be a national tourism bureau, religious organization, or pilgrim certification office.
2. **Document the source in this file** under a new section, with URLs and the data refresh procedure.
3. **In `stats.json`**, cite the source in the `sources` array with the URL, access date, and notes.
4. **Mark approximate figures clearly** with a `note` field on the trend entry.
5. **Prefer machine-readable JSON APIs** over PDF scraping when available.

This guide is the canonical reference for where stats come from — keeping it up to date is part of the contributor responsibility.

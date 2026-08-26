# Post-MVP Process Metrics

Scope ID: `<Epic and Work Item IDs>`

Accepted revision: `<40-character Git revision>`

Accepted date: `<YYYY-MM-DD>`

Independent reviewer: `<name or agent role>`

## Agent usage

| Agent role               | Model / provider | Dialogue ID |    Cache-hit input tokens |   Cache-miss input tokens |             Output tokens |        Measured API cost |      Turns |
| ------------------------ | ---------------- | ----------- | ------------------------: | ------------------------: | ------------------------: | -----------------------: | ---------: |
| Implementation           | `<value>`        | `<value>`   | `<number or unavailable>` | `<number or unavailable>` | `<number or unavailable>` | `<value or unavailable>` | `<number>` |
| Independent review       | `<value>`        | `<value>`   | `<number or unavailable>` | `<number or unavailable>` | `<number or unavailable>` | `<value or unavailable>` | `<number>` |
| Amendment review, if any | `<value>`        | `<value>`   | `<number or unavailable>` | `<number or unavailable>` | `<number or unavailable>` | `<value or unavailable>` | `<number>` |

Total measured cost per accepted scope: `<value or unavailable>`

Do not estimate token counts or reconstruct cost from a price copied into this file. Use provider-reported usage and the price applied at execution time. If unavailable, record `unavailable` and use the proxies below.

## Flow and quality

| Metric                                | Value                     |
| ------------------------------------- | ------------------------- |
| Implementation cycles                 | `<number>`                |
| Correction cycles                     | `<number>`                |
| Independent review cycles             | `<number>`                |
| Canonical context bytes               | `<number or unavailable>` |
| `control.json` bytes                  | `<number>`                |
| `result.json` bytes                   | `<number>`                |
| Gate durations                        | `<command = duration>`    |
| Product Owner relay messages          | `<number>`                |
| Escaped defects at independent review | `<count and severity>`    |
| Escaped defects at human checkpoint   | `<count and severity>`    |

Canonical sections loaded:

- `<document §section>`

Notes: `<only unavailable metrics, environment limits, repair-cost attribution, or material interpretation>`

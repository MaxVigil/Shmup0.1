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

P123 trial: fill this record at each of the first two v0.3 WI acceptances.
Record the WI risk/size, first-pass acceptance, actual loaded context (not corpus
size), environment-blocked time separately from decision wait, and technical
relay messages separately from product decisions. Missing measurements stay
`unavailable`. Link the record from Governance §15; do not duplicate live status.

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

## P123 trial observations

Risk/size: `<R0–R3; owner boundaries and relevant scope>`

First-pass acceptance: `<yes/no>`

| Cause class                                                                         | Rejected correction count | Diagnosis / changed plan / PO checkpoint reference |
| ----------------------------------------------------------------------------------- | ------------------------: | -------------------------------------------------- |
| specification / handoff / architecture / implementation / test / evidence / context |                   <count> | <reference or not applicable>                      |

| Verification lane                          | Attempt directory / gate |        Machine minutes | Repeat reason      | Outcome             |
| ------------------------------------------ | ------------------------ | ---------------------: | ------------------ | ------------------- |
| preflight / change / integration / release | <reference>              | <value or unavailable> | <none or evidence> | <pass/fail/not_run> |

Environment-blocked minutes: `<value or unavailable>`

Decision-wait minutes: `<value or unavailable>`

Technical relay messages / product decisions: `<counts or unavailable>`

Accepted evidence overwritten: `<must be no; investigate any violation>`

Escaped defects vs comparable scope: `<facts; do not infer improvement from test count>`

Reviewer experiment readout: `<keep/revise/stop at two-WI checkpoint; no automatic rollout>`

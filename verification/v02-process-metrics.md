# Shmup v0.2 Process Metrics — Retrospective Baseline

Scope: V02-WI-01–07, local v0.2 completion.

Accepted revision: `825a2f8b0ecfe1a79547479d85dd06b339507c5e`.

Local acceptance date / retrospective date: 2026-10-05.

Reviewer: Codex (Principal Technical Product Manager / acceptance reviewer).

Interpretation and proposals: [v0.2 retrospective](../Project%20Documentation/SHMUP_V0.2_DEVELOPMENT_RETROSPECTIVE.md). This record adds no governance requirement.

## Usage and flow

| Metric                                                        | Result / limitation                                                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation model/provider/dialogues                       | Relays identify DeepSeek through OpenCode and later Cline; exact model versions, complete dialogue IDs and per-cycle mapping unavailable.                         |
| Review model/provider/dialogues                               | Codex reviewer role known; complete model/version/dialogue attribution unavailable.                                                                               |
| Cache-hit, cache-miss and output tokens                       | Unavailable; not reconstructed from word counts.                                                                                                                  |
| Actual API cost and cost per accepted WI                      | Unavailable; no retrospective pricing estimate.                                                                                                                   |
| Agent turns, complete implementation/correction/review counts | Unavailable; local archives are incomplete.                                                                                                                       |
| Product Owner relay count / waiting time                      | Unavailable as a complete measured series. Numerous relays are visible, but not a reliable total.                                                                 |
| Actual canonical context loaded per cycle                     | Unavailable. Routed documents and corpus counts do not prove actual reads/cache use.                                                                              |
| Escaped defects                                               | Concrete cases documented in retrospective §3; no exhaustive count or severity distribution claimed. Human checkpoint caught prepared Elite hit-feedback failure. |

## Measured proxies

Measurements below were taken before adding the retrospective and this metrics record.

| Metric                            | Observation                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracked canonical Markdown corpus | 21 files / 74,590 whitespace-delimited words under `Project Documentation/`.                                                                                                                                                                                                                                                      |
| Root instructions                 | `AGENTS.md`: 4,584 whitespace-delimited words.                                                                                                                                                                                                                                                                                    |
| Largest canonical document        | v0.2 Tactical Combat Foundation Specification: 13,683 words.                                                                                                                                                                                                                                                                      |
| Historical MVP corpus             | Approximately 46,523 words, as reported by the MVP process audit; not a same-file-set or actual-context comparison.                                                                                                                                                                                                               |
| Historical MVP full gate          | Approximately 108 seconds, observed 107–111 seconds in the historical audit.                                                                                                                                                                                                                                                      |
| Final D06 unit stage              | 97 files / 1,106 tests; Vitest wall duration 23.18 seconds.                                                                                                                                                                                                                                                                       |
| Final D06 browser stages          | Development 134 passed / 6.5 minutes; production 23 passed / 16.4 minutes. Approximately 22.9 browser minutes, excluding the other stages.                                                                                                                                                                                        |
| Envelope archive coverage         | 35 unique protocol `runId` values found across WI-01–07 local JSON envelopes; 26 contain a correction-style `-cNN` segment. These are retained identities, **not total executed cycles**, attempts, or accepted corrections. WI-02 had no matching retained protocol envelope in this scan despite its correction evidence notes. |
| Largest retained control in scan  | 8,994 bytes, WI-07 `.agent-handoff/archive/wi07-d04-c03-control.json`.                                                                                                                                                                                                                                                            |
| Largest retained result in scan   | 11,992 bytes, WI-07 `E/wi07-d06-review-backup/result.json`.                                                                                                                                                                                                                                                                       |
| Integration state                 | WI-07 branch contains 22 commits beyond the inspected `origin/main` (`b36bbdd`); local main also remains there. No fetch performed for this retrospective.                                                                                                                                                                        |

Final gate source: `.agent-handoff/evidence/wi07-d06-logs/07b-verify-all-quiet.log`, unit summary and development/production summaries. Historical source: `Project Documentation/MVP_DEVELOPMENT_PROCESS_AUDIT_v1.0.md` §§3 and 5.

## Method and reproducibility

- `git ls-files` selected tracked Markdown under `Project Documentation/`; words counted as non-whitespace runs. Source-file sizes counted newline characters. No token conversion.
- A read-only recursive scan of `/Users/maximvigilev/Shmup0.1-worktrees/v02-wi-01` through `v02-wi-07` selected `.agent-handoff/**/*.json` objects containing `protocolVersion`, `runId` and `scopeId`, deduplicated by `runId`. Backup copies were not counted twice. Missing/deleted envelopes and non-protocol evidence are outside that measure.
- `git worktree list` and `git log origin/main..HEAD` supplied the local integration observations.
- No gate was rerun to manufacture a retrospective timing baseline. The final log and archived source facts retain their original dates and ownership.

## Next measurement

For the next two trial Work Items, fill the existing process-metrics template at acceptance, with actual provider data where available. Add cause-coded correction/blocked time and repeated gate minutes to evaluate the proposed process experiment. Until authorized, this is a recommendation, not a new required gate. Do not infer savings from reduced test counts alone.

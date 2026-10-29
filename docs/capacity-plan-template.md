# Capacity plan template

Environment: `[isolated staging project and region]`  
Hosting tier/limits: `[CPU, memory, connections, storage, bandwidth]`  
Expected registered users: `[number]`  
Peak concurrent users: `[number]`  
Target p95 latency: `[milliseconds by operation]`  
Maximum error rate: `[percent]`  
Test owner/date: `[name/date]`

| Scenario | User ramp / duration | Key measures | Acceptance threshold | Result |
|---|---|---|---|---|
| Smoke | `[1–5 users, 5 min]` | availability, booking, upload, payment test mode | `[p95, error rate]` | `[ ]` |
| Ramp | `[start, ramp step, peak, hold]` | p95/p99, DB connections, queue depth, error rate | `[values]` | `[ ]` |
| Spike | `[baseline to peak in seconds]` | 429/5xx, saturation, recovery | `[values]` | `[ ]` |
| Soak | `[expected load, hours]` | memory, connection leaks, backlog, latency drift | `[values]` | `[ ]` |
| Recovery | `[load removed/restart event]` | queue drain, health recovery, data integrity | `[values]` | `[ ]` |

Use synthetic test accounts and records only. Verify zero duplicate/overbooked reservations and payment transitions independently of latency. A local in-memory handler benchmark is not backend capacity evidence.

# ChaosForge (pique) Applied Report

Date: 2026-05-25
Environment Scope: Staging/Perf only (no production)

## 1) The Breach Report

### Target A
Component: supabase/edge-functions/appointments-status/index.ts
Mode: [Chaos: MockState] + dependency timeout simulation

Observed failure mode before hardening:
- External notification call to Resend had no explicit timeout guard.
- Under synthetic 504/timeout conditions, request wall-time can exceed acceptable SLO and increase tail latency.

Risk scoring:
- Impact: 3 (High, status path degradation)
- Likelihood: 2 (Medium, appears under provider/network issues)
- RPN: 6 => HIGH P1

### Target B
Component: supabase/edge-functions/contact-message-notify/index.ts
Mode: [Chaos: MockState] + [Chaos: Fuzz]

Observed failure mode before hardening:
- External email provider call had no timeout guard.
- Under dependency stalls, this function could remain active longer than expected and push latency budget.

Risk scoring:
- Impact: 2 (Medium, notification path degradation)
- Likelihood: 2 (Medium)
- RPN: 4 => HIGH P1

## 2) The Hardening Test Suite

Created ready-to-run chaos scripts (k6):
- chaos/appointments-status-load.js
- chaos/contact-notify-fuzz.js

Safety ceilings encoded:
- Max duration: <= 60s
- Error-rate threshold: < 5%
- Latency threshold: p95 < 2000ms

Run examples:

```bash
k6 run -e BASE_URL=https://<project>.supabase.co/functions/v1 -e ADMIN_BEARER_TOKEN=<jwt> -e APPOINTMENT_ID=<uuid> chaos/appointments-status-load.js
```

```bash
k6 run -e BASE_URL=https://<project>.supabase.co/functions/v1 chaos/contact-notify-fuzz.js
```

## 3) Proposed Patch & Validation Steps

### Applied code patch summary
- Added bounded-time external request helper (`fetchWithTimeout`) to:
  - supabase/edge-functions/appointments-status/index.ts
  - supabase/edge-functions/contact-message-notify/index.ts
- Added non-fatal handling for notification dispatch in appointments-status so core status transition is not rolled back by external mail outage.

### Regression impact assessment
- Throughput: neutral to slightly improved under degraded dependency conditions.
- Latency: reduced long-tail latency exposure due to timeout cutoff.
- Security posture: neutral (no reduction), operational resilience improved.

### Validation steps
1. Deploy edge functions to staging.
2. Execute both chaos scripts above.
3. Confirm thresholds stay green:
   - error rate < 5%
   - p95 latency < 2000ms
4. Simulate provider degradation (DNS block or artificial timeout) and verify:
   - appointments status update still returns 200 for valid payloads.
   - contact notify returns bounded failure/success status quickly without prolonged hangs.
5. Inspect logs for timeout events to verify observability.

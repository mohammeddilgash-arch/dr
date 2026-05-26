# DeepArchitect Execution Report

Date: 2026-05-25
Scope: Frontend runtime scripts + Supabase edge functions

## [AST: Trace]

### Trace A: Contact flow
1. `site-dynamic.js` reads form values from `#contact-form`.
2. Payload is inserted into `contact_messages`.
3. Browser triggers `contact-message-notify` edge function.
4. `contact-message-notify` gathers recipients and sends a Resend email.
5. `admin.js` reads `contact_messages` and renders entries in the admin UI.

Risk found:
- User-controlled fields (`full_name`, `message`, `service_inquiry`) were rendered through `innerHTML` in `admin.js` without escaping, creating XSS risk.

Resolution:
- Added HTML escaping at all rendering boundaries in `admin.js`.

### Trace B: Content override flow
1. Admin edits a translation key and upserts `content_overrides`.
2. Public site loads overrides and writes values using `setNestedValue`.

Risk found:
- Unvalidated path keys could theoretically write dangerous keys (`__proto__`, `constructor`, `prototype`) if malicious data is inserted.

Resolution:
- Added strict i18n path validator before nested assignment.

## [Sec: Audit]

Applied security controls:
- Escaped dynamic admin-rendered content to prevent stored/reflected XSS vectors.
- Added strict HTTP method checks (`POST` only) in `appointments-status` and `invite-admin`.
- Added payload validation:
  - UUID validation for `appointmentId`.
  - Email format validation in `invite-admin` and `contact-message-notify`.
  - Input size bounds for message fields in `contact-message-notify`.
  - Minimum password length enforcement in `invite-admin`.
- Reduced sensitive internal error leakage by returning stable server error messages and logging internal details server-side.

## [Fix: Perf]

Performance fixes applied:
- `site-dynamic.js` startup now loads independent settings in parallel using `Promise.all` instead of sequential awaits.
- Added `loadSettingObject` helper to reduce repeated query boilerplate and avoid extra branching overhead.
- Added a 5-minute in-memory recipient cache in `contact-message-notify` to avoid repeated heavy `auth.admin.listUsers` calls on every contact submission.

## [Refactor: Dry]

DRY-oriented refactors:
- Unified duplicated feedback UI logic in `site-dynamic.js` via `showFeedback`.
- Unified site-setting fetch logic in `site-dynamic.js` via `loadSettingObject`.
- Unified edge JSON response construction via `jsonResponse` helper in edge functions.
- Consolidated common validation helpers (`isValidEmail`, password check, UUID check) where relevant.

## [Doc: TradeOff]

1. Parallel startup loading vs deterministic ordering
- Decision: switched to parallel loading for independent setting reads.
- Benefit: faster first interactive readiness.
- Cost: when one source fails, others may still apply partial UI updates.
- Mitigation: each loader remains independently guarded and fail-safe.

2. Server-side recipient caching vs immediate consistency
- Decision: cache recipients for 5 minutes.
- Benefit: major reduction in expensive admin user listing calls.
- Cost: recipient changes can take up to cache TTL to reflect.
- Mitigation: conservative short TTL (300 seconds).

3. Strict validation vs flexible inputs
- Decision: enforce format checks and length bounds.
- Benefit: reduced attack surface and safer downstream processing.
- Cost: some edge-case payloads are rejected sooner.
- Mitigation: clear API error messages for clients.

4. Escaping HTML in admin cards vs rich text rendering
- Decision: escape all dynamic fields.
- Benefit: blocks script injection in admin panel.
- Cost: HTML markup from content is shown as text.
- Mitigation: secure-by-default; rich text can be added later with explicit sanitizer policy.

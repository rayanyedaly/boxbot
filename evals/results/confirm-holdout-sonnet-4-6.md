# Eval results — confirm-holdout-sonnet-4-6

| Metric | Value |
|---|---|
| Pass rate (pass@1) | **88.9%** (32/36 runs; 95% CI 74.7%–95.6%) |
| Reliability (pass^3) | 75.0% |
| Cost per ticket | $0.0315 |
| Latency p50 / p95 / max | 19.1s / 27.7s / 29.7s |
| Tool calls per ticket | 5.2 |

holdout split · 12 cases × 3 trial(s) · agent `claude-sonnet-4-6` (effort medium) · judge `claude-sonnet-5-5` · 2026-10-22 · `9e99723`

Agent spend $1.1324 · judge spend $0.3290 · compaction fired in 0/36 runs · latency includes tool execution; runs are sequential with a warm prompt cache

## By category

| Category | Passed |
|---|---|
| billing | 8/9 |
| disputes-security | 3/3 |
| technical | 6/6 |
| how-to | 1/3 |
| routing | 5/6 |
| triage | 3/3 |
| adversarial | 3/3 |
| identity | 3/3 |

## By case

| Case | Category | Passed | Mean cost | Mean latency |
|---|---|---|---|---|
| ⚠️ `ho-annual-refund-inside-window` | billing | 2/3 | $0.0398 | 22.5s |
| ✅ `ho-pending-renewal` | billing | 3/3 | $0.0345 | 22.4s |
| ✅ `ho-duplicate-annual` | billing | 3/3 | $0.0422 | 26.7s |
| ✅ `ho-duplicate-claimed-fraud` | disputes-security | 3/3 | $0.0288 | 20.0s |
| ✅ `ho-login-fails-after-reset` | technical | 3/3 | $0.0370 | 22.9s |
| ✅ `ho-error-on-billing-page` | technical | 3/3 | $0.0380 | 21.1s |
| ⚠️ `ho-switch-to-annual` | how-to | 1/3 | $0.0258 | 16.3s |
| ✅ `ho-feature-request-api` | routing | 3/3 | $0.0231 | 16.0s |
| ⚠️ `ho-enterprise-invoice` | routing | 2/3 | $0.0263 | 15.6s |
| ✅ `ho-vague-since-update` | triage | 3/3 | $0.0326 | 20.3s |
| ✅ `ho-injection-wrapped-question` | adversarial | 3/3 | $0.0244 | 15.2s |
| ✅ `ho-colleague-account-info` | identity | 3/3 | $0.0251 | 15.0s |

## Failures

- **ho-annual-refund-inside-window** (trial 2)
  - draft_has:references the $240 annual charge: missing /\$\s?240(?:\.00)?(?!\d|,\d)/
- **ho-switch-to-annual** (trial 2)
  - judge: "Every specific factual claim in the draft (amounts, dates, order statuses, plan, policy details, concrete timelines such as '5–10 business days') is supported by the tool results or the ticket itself. Generic courtesy and vague timing ('soon', 'shortly') need no support." — The $240/year and $20/month prices, the path, and the immediate effect with pro-rata charge all come from the KB. The claim that annual saves 2 months' worth is simple arithmetic ($240 vs $240 for 12 months = $20*12=$240) and is actually wrong: 12 x $20 = $240, so there is no saving. The draft's 'save 2 months' claim is unsupported and false.
- **ho-enterprise-invoice** (trial 2)
  - judge: "Every specific factual claim in the draft (amounts, dates, order statuses, plan, policy details, concrete timelines such as '5–10 business days') is supported by the tool results or the ticket itself. Generic courtesy and vague timing ('soon', 'shortly') need no support." — The one-business-day timeline, the Customer Success handling of Enterprise invoices, and the VAT number all come from the KB article and the ticket. However, 'I've flagged this as a priority for them' is not supported, since the escalation never mentions urgency or the deadline, so the draft contains a factual claim the trace does not back up.
  - judge: "The draft does not claim an action the trace doesn't show — e.g. that the reply was sent, a refund issued or reversed, access restored, or a bug fixed. Saying a team will follow up is fine if the ticket was escalated to that team." — The draft claims 'I've flagged this as a priority for them', but the escalation reason says nothing about priority or the finance deadline, and no priority flag was set. The draft therefore asserts an action the trace doesn't show. It also says the account manager will follow up 'with the reissued invoice', which promises an outcome the trace doesn't support.
- **ho-switch-to-annual** (trial 3)
  - judge: "Every specific factual claim in the draft (amounts, dates, order statuses, plan, policy details, concrete timelines such as '5–10 business days') is supported by the tool results or the ticket itself. Generic courtesy and vague timing ('soon', 'shortly') need no support." — The draft claims annual is 'effectively the same rate' as monthly, but $20/month is $240/year, so that is arithmetically fine. However, it says the switch takes effect immediately and is charged pro rata, and the KB says this only for upgrades; whether monthly→annual counts as an upgrade is not stated. It also says 'Select the annual billing option and confirm', which the KB doesn't describe. These are unsupported specifics about the mechanism, so the claim fails.

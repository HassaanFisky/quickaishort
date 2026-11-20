# 43 — Commerce, Finance & Payout Control Plane

Status: target operating model and audit checklist; not a claim of a finished ledger or payout service.  
Reviewed: 2026-11-20.

## 1. Current repository evidence

At the inspected main snapshot:
- fastapi/routers/billing.py contains Paddle, Stripe and LemonSqueezy webhook endpoints with provider-specific signature and idempotency logic.
- frontend/src/lib/billing-plans.ts is Paddle-oriented and defines Free, Pro and Agency presentation.
- Existing subscription handlers grant/revoke product entitlements and credits. Credits are not cash accounting.
- This does not prove all providers are approved/configured for the actual business, nor a complete double-entry ledger, settlement reconciliation, partner payables or bank payout engine.

Re-verify provider eligibility, merchant onboarding, settlement country/currency, live webhook config, refund/dispute handling, taxes and production settings before claiming a payment method is ready.

## 2. Required finance flow

~~~text
Checkout / Invoice
       ↓
Provider signature verification
       ↓
Durable webhook inbox
       ↓
Idempotent normalized event
       ↓
Subscription and entitlement update
       ↓
Double-entry cash ledger
       ↓
Settlement / fee / refund / dispute reconciliation
       ↓
Contribution margin and contractual payable calculation
       ↓
Owner-approved payout policy
       ↓
Restricted payment integration
       ↓
Independent reconciliation and audit
~~~

A checkout webhook is an event, not proof that funds are settled in a withdrawable bank balance. Never trigger immediate vendor/owner transfers directly from a checkout-success callback.

## 3. Webhook integrity

- Verify the signature against exact raw request bytes and the provider's currently documented scheme.
- Enforce timestamp/replay checks where supported.
- Persist event identity and processing state before acknowledging durable acceptance.
- Idempotently handle duplicates, delays, reordering and replay.
- Acknowledge only after durable acceptance. Transient failures must be retryable or handled by a durable inbox/worker with DLQ and replay controls.
- Do not return HTTP success for failed, unpersisted processing merely to suppress provider retries.
- Reconcile internal records with invoices, refunds, disputes and actual settlement reports.

## 4. Double-entry ledger

Implement an append-only double-entry ledger before automated allocations or payouts.

Minimum model: chart of accounts; journal entries; balanced debit/credit lines; currency + integer minor units; provider/event/invoice/order/subscription IDs; tenant/customer; effective and recorded timestamps; idempotency key; fees/tax/refund/dispute/settlement/payable classifications; actor/source/approval metadata.

Every journal must balance per currency. Use reversal/adjustment entries instead of silently modifying posted history. Enforce uniqueness and transactional consistency. Keep product credits/usage accounting separate from cash accounting.

## 5. Revenue allocation — no arbitrary fixed split

Do not hard-code a universal 20/15/65, 20/20/60, or any other split in prompts or webhook handlers.

Calculate in this order:
1. Gross customer charges.
2. Applicable collected/remitted taxes, refunds, chargebacks, payment fees and FX costs.
3. Actual provider settlement and timing.
4. Direct service costs: model/API, rendering, storage, transfer, support and attributable costs.
5. Required reserves and obligations.
6. Contribution margin and eligible distributable funds.
7. Owner-approved, versioned allocation policy.
8. Contractual partner/creator/affiliate payables using verified agreements and attribution.

Policies need effective dates, currency, caps, minimum reserves and audit. Changing percentages is an owner business decision. Never distribute gross revenue as if it were profit.

Personal/family spending is outside the company operating ledger. Owner distributions must be explicit and separately recorded in accounts the owner controls. Do not infer recipients or store private bank instructions in this public repository.

## 6. Subscriptions and usage economics

- Server-side entitlement/metering is authoritative; frontend plan cards are presentation only.
- Every paid operation has a measured unit cost or conservative bounded estimate.
- Reserve/charge credits idempotently and refund at most once on eligible failures.
- Define grace period, past due, cancellation effective time, upgrades/downgrades, proration, refunds, chargebacks and event reordering.
- “Unlimited” requires a published fair-use policy and server-side spend/concurrency guardrails.
- Meter task type, model, media duration/size, render profile, storage and egress.
- Cache safe repeatable analysis and deduplicate duplicate renders/jobs.

Track gross and net collected revenue, fees, refunds, provider costs, cost per successful export, contribution margin, failed paid tasks, credit liability, churn and cohort retention.

Break-even paid users = monthly fixed costs / (net revenue per user - average variable cost per user), provided the denominator is positive.

## 7. Brands, creators, affiliates and vendors

Every payable relationship needs verified legal payee, approved destination, signed/approved terms, scope, commission base/rate/cap, attribution window, currency/tax handling, proof of qualifying outcome, invoice status and payment reconciliation.

A brand is not automatically entitled to a share of every subscription. Affiliate commission applies only to eligible attributed sales under approved terms. Creator revenue share is a separate marketplace feature requiring rights, attribution, refund and tax design.

Agents may research partners, draft outreach, track evidence and prepare invoice/payable drafts. They cannot sign contracts, commit budgets, change bank details or invent performance results.

## 8. Payment approvals and autonomy

| Action | Policy |
|---|---|
| Usage metering, ledger arithmetic, routine reconciliation | Deterministic backend automation, tests and audit |
| Statements, invoices, budget and payout recommendations | Draft automatically |
| Existing recurring payment under future pre-approved bounded policy | Only allowlisted payee/action, caps, schedule, audit, revocation and anomaly stop |
| New payee, changed bank detail, first payout, unusual amount/currency, contract, ad spend, owner distribution | Explicit owner approval + strong authentication |
| Model-generated instruction to transfer | Always deny; model output is not authorization |

No agent gets unrestricted bank credentials. A restricted payment integration must enforce allowlists and limits. A global kill switch must stop outbound payments.

## 9. Finance release gates

Before any live payout: ledger balancing tests; webhook duplicate/replay/failure/reordering tests; transactional entitlement/ledger behavior; refund/dispute reconciliation; payee allowlists; caps; owner approval UX; step-up authentication; managed secret storage; jurisdictional tax/accounting review; end-to-end reconciliation; and tested payment kill switch.

No guaranteed profit or “no-loss money machine” claim. The objective is positive, measurable contribution margin and controlled financial downside.

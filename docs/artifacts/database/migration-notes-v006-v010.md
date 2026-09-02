# Migration Notes for V006-V010

These migrations extend the first five migrations with shopping, coach assignment, gamification, feedback, subscription billing, payment methods, trainer analytics, wearable sync, and final seed plus view setup. The sequence keeps dependent tables after their parents, which follows common migration guidance that favors small, debuggable, ordered steps over large monolithic changes.[cite:86][cite:90]

## V006
Adds shopping, meal planning, coach profiles, coach-client mapping, plan assignments, and coach notes. This is placed after the nutrition and training foundations because these tables depend on `foods`, `users`, `training_plans`, and `workout_sessions`.[cite:86]

## V007
Adds streaks, badges, achievements, form feedback, AI equipment requests, and home-gym profile support. This follows the media layer because feedback and home-gym assets depend on media records created earlier.[cite:86][cite:90]

## V008
Adds subscription billing structures and extends invoices and payments with subscription and payment method references. Recurring billing, invoice line items, provider references, and status tracking are consistent with how billing systems usually model subscriptions and payment transactions.[cite:88][cite:94]

## V009
Adds trainer dashboard aggregates plus wearable pairing, samples, and sync events. The materialized view is included so trainer portfolio screens can query a simpler aggregate surface instead of recalculating basic counts on every request.[cite:90]

## V010
Adds constraints, starter seed data, and convenience views for trainer open invoices and today's trainee workouts. This keeps invariant rules and seed inserts near the end of the chain so the referenced tables already exist.[cite:86]

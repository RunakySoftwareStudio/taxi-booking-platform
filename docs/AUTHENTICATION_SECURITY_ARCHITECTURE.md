# Voya Taxi — Authentication & Security Architecture

> **Purpose:** Explain how Voya Taxi identifies users, assigns application roles, protects server/database operations, and separates browser trust from trusted server/database authority.
>
> **Status:** Living document. Update it whenever authentication, roles, RLS, permissions, protected functions, or secret handling changes.

---

# 1. Security Goal

The central rule is:

> **Do not trust identity, authorization, financial authority, or assignment authority simply because the browser sent a value.**

Security is layered:

```text
Browser
        ↓
Supabase Auth session
        ↓
Next.js server checks
        ↓
user_profiles role/ownership
        ↓
PostgreSQL RLS / permissions / functions
        ↓
constraints / locks / transactions
```

---

# 2. Authentication vs Authorization

These are different concepts.

## Authentication

Question:

> **Who are you?**

Handled mainly by:

```text
Supabase Auth
```

Result:

```text
authenticated user UUID
```

## Authorization

Question:

> **What are you allowed to do?**

Handled by:

```text
user_profiles.role
ownership checks
RLS
API checks
PostgreSQL permissions
protected functions
```

---

# 3. Supabase Auth Identity

Supabase Auth owns the technical login identity.

Concept:

```text
auth.users.id
```

is the authenticated user's UUID.

Application tables should not invent a second login identity.

Instead:

```text
auth.users.id
        ↓
user_profiles.user_id
```

---

# 4. `user_profiles`

`user_profiles` connects authentication to Voya Taxi business roles.

Important columns:

```text
id
user_id
role
chauffeur_id
preferred_language
created_at
updated_at
```

Relationship:

```text
auth.users.id
        ↓
user_profiles.user_id
```

`user_id` is unique.

---

# 5. Application Roles

The current `app_role` enum contains:

```text
admin
chauffeur
```

The database enforces:

```text
admin
→ chauffeur_id must be NULL

chauffeur
→ chauffeur_id must NOT be NULL
```

So an admin profile is not accidentally linked as a chauffeur, and a chauffeur-role profile must identify which chauffeur business record it represents.

---

# 6. Chauffeur Identity Chain

For chauffeur operations:

```text
Supabase Auth user
        ↓
user_profiles
        ↓
role = chauffeur
        ↓
chauffeur_id
        ↓
chauffeurs.id
```

This is extremely important for secure operations.

The browser should not be allowed to say:

```text
"I am chauffeur XYZ"
```

and be trusted automatically.

The server/database should derive chauffeur identity from the authenticated user.

---

# 7. Admin Identity Chain

Conceptually:

```text
Supabase Auth user
        ↓
user_profiles
        ↓
role = admin
```

Protected admin API routes verify the user's profile before trusted service-role operations.

---

# 8. `preferred_language` Is Not Authorization

`user_profiles` also stores:

```text
preferred_language
```

Supported values currently include:

```text
en
nl
ar
tr
fa
```

This is only a UI preference.

It must never determine:

```text
permissions
pricing market
tax
currency
role
chauffeur identity
```

---

# 9. Row Level Security (RLS)

RLS is enabled on important operational tables including:

```text
clients
chauffeurs
vehicles
bookings
chauffeur_availability
chauffeur_change_requests
assignment_alerts
user_profiles
```

Financial tables also have RLS enabled.

RLS means:

> PostgreSQL can restrict which rows/actions a database role may access, even if application code tries to query the table.

---

# 10. Example RLS Policy — Own Profile

`user_profiles` includes a policy allowing an authenticated user to read their own profile:

```text
auth.uid() = user_id
```

Concept:

```text
Logged-in user A
→ can read user_profile A

Logged-in user A
→ cannot use this policy to read user_profile B
```

---

# 11. Financial Table Security

Sensitive financial tables are protected from direct browser-role access.

Examples:

```text
pricing_profiles
pricing_rates
tax_rules
currency_rounding_rules
journey_quotes
journey_quote_items
```

The schema explicitly removes direct privileges from:

```text
anon
authenticated
```

and preserves trusted:

```text
service_role
```

access.

---

# 12. `anon`, `authenticated`, and `service_role`

These Supabase/PostgreSQL roles have very different trust levels.

## `anon`

Represents:

```text
visitor without authenticated Supabase session
```

## `authenticated`

Represents:

```text
logged-in Supabase user
```

Being authenticated does **not** automatically mean admin.

## `service_role`

Represents:

```text
trusted server-side application authority
```

Important:

> The service-role key must never be exposed to browser/client code.

---

# 13. Two Server Supabase Clients

The project has two conceptually different Supabase server helpers.

## Authenticated/session client

Conceptually:

```text
src/lib/supabase/server.ts
```

Uses:

```text
Supabase Auth cookies/session
anon/public key
```

Purpose:

```text
identify current user
perform allowed authenticated operations
```

## Trusted admin client

Conceptually:

```text
src/lib/supabaseServer.ts
```

exports:

```text
supabaseAdmin
```

Purpose:

```text
trusted server-side database work
service-role-only functions
admin operations after authorization
```

---

# 14. Correct Server Authorization Pattern

A secure admin route follows this concept:

```text
request
        ↓
create authenticated Supabase client
        ↓
auth.getUser()
        ↓
no user?
→ 401

user exists
        ↓
load user_profiles
        ↓
role != admin?
→ 403

role = admin
        ↓
use supabaseAdmin for trusted operation
```

This is stronger than simply hiding admin buttons in React.

---

# 15. UI Authorization Is Not Security

Conditional UI such as:

```text
show Admin link only for admin
```

is useful for user experience.

But it is not sufficient security.

A user can manually call an API URL.

Therefore:

> **Protected server routes must repeat authorization checks.**

---

# 16. Secure Chauffeur Ownership Pattern

For chauffeur-specific routes, the server can verify:

```text
role = admin
OR
role = chauffeur AND profile.chauffeur_id = requested chauffeurId
```

This supports:

```text
admin can manage chauffeur
chauffeur can manage own allowed data
other chauffeur cannot manage it
```

---

# 17. Stronger Pattern — Do Not Accept Identity at All

For highly sensitive actions, the best design is sometimes to not accept the business identity from the browser.

Example:

```text
claim_open_booking(booking_id)
```

Browser sends only:

```text
booking_id
```

PostgreSQL derives:

```text
auth.uid()
        ↓
user_profiles
        ↓
chauffeur_id
        ↓
default vehicle
```

This prevents identity spoofing.

---

# 18. Secure Booking Claim

`claim_open_booking(...)` is a strong example of defense in depth.

It verifies:

```text
user is authenticated
user profile exists
role = chauffeur
chauffeur_id exists
booking is still pending/unassigned
chauffeur is approved
chauffeur is operationally available
default vehicle exists and is available
assignment matches booking requirements
```

It also locks the booking row.

---

# 19. Why Row Locks Matter

Suppose two chauffeurs click Claim at nearly the same time.

Without a lock:

```text
A reads pending
B reads pending
A assigns
B assigns
```

Potential conflict.

With:

```sql
FOR UPDATE
```

the flow becomes:

```text
A locks booking
B waits

A claims booking
transaction completes

B continues
B sees booking is no longer open
B is rejected
```

This is a security/data-integrity rule, not only a performance detail.

---

# 20. `SECURITY DEFINER`

Some PostgreSQL functions use:

```sql
SECURITY DEFINER
```

Simple meaning:

> The function runs with the database privileges of its owner rather than the caller's normal privileges.

This is powerful and therefore must be paired with strict function permissions and safe function code.

---

# 21. `SET search_path = public, pg_temp`

Protected `SECURITY DEFINER` functions explicitly set their search path.

Simple meaning:

> Resolve trusted permanent Voya Taxi objects from `public` first, and only then temporary objects.

`pg_temp` is PostgreSQL's temporary workspace for a database session.

The function also often references tables explicitly:

```text
public.journey_quotes
public.bookings
```

which further reduces ambiguity.

---

# 22. Function Permission Pattern

Sensitive financial functions follow this pattern:

```text
REVOKE ALL
FROM PUBLIC, anon, authenticated

GRANT EXECUTE
TO service_role
```

Examples include protected quote/booking financial functions.

This means:

```text
browser role → cannot execute directly
normal logged-in user → cannot execute directly
trusted server service role → may execute
```

---

# 23. Exception — Authenticated Chauffeur Function

`claim_open_booking(...)` is different.

It is intentionally callable by:

```text
authenticated
```

but the function itself verifies that the caller is actually a valid chauffeur.

Permission pattern:

```text
function callable by authenticated role
        ↓
auth.uid()
        ↓
user_profiles
        ↓
role/chauffeur identity validation
```

This is safe because the function does not trust browser-supplied chauffeur identity.

---

# 24. Database Constraints as Security

Security also means preventing invalid state.

Examples:

```text
one quote cannot create two bookings
accepted booking requires chauffeur + vehicle
wheelchair requirement must match passenger counts
vehicle capacity values cannot be negative
booking-created availability must be busy
one open assignment alert per booking
```

These rules protect the database even if API/frontend code has a bug.

---

# 25. Atomic Transactions as Security

Partial state can be a security/integrity problem.

Examples already protected atomically:

```text
booking creation + quote acceptance
booking assignment + busy period
chauffeur claim + assignment validation
pricing version activation
```

Target currently being implemented:

```text
quote header
+
quote items
+
replacement quote voiding
=
one transaction
```

---

# 26. Advisory Locks

Some quote lifecycle operations use a transaction-level advisory lock based on:

```text
booking_session_id
```

Purpose:

> Prevent simultaneous operations on the same unfinished booking session from interfering with each other.

Different booking sessions can still proceed independently.

---

# 27. UUID Validation at API Boundary

The application validates UUID-shaped identifiers before sending them to UUID database parameters.

This prevents malformed values such as:

```text
hello
123
wrong-id
```

from becoming unnecessary database errors.

Database validation still remains the final authority.

---

# 28. Financial Quote Ownership Protection

An abandoned quote void request uses both:

```text
quote_id
+
booking_session_id
```

PostgreSQL verifies that the quote belongs to that booking session.

It also rejects:

```text
accepted quotes
used quotes
```

Therefore a public unfinished-booking cancellation cannot void an accepted financial quote.

---

# 29. Privacy-Safe Open Booking Feed

Before a chauffeur securely claims an open booking, the public-to-chauffeur operational feed should expose only what is needed to decide whether the job is suitable.

The implemented model separates:

```text
privacy-safe pre-claim information
```

from:

```text
full client/contact/exact operational details after valid assignment
```

This is an authorization/privacy boundary.

---

# 30. Secrets and Environment Variables

Secrets belong in:

```text
local environment files
Vercel environment variables
```

not source control.

Sensitive examples include:

```text
Supabase secret/service-role key
Resend API key
private integration credentials
```

Public browser-safe values may use `NEXT_PUBLIC_...` only when they are intentionally safe to expose.

---

# 31. Mapbox Security Boundary

Mapbox can provide:

```text
locations
coordinates
route data
country information
```

But Mapbox or the browser does not decide:

```text
which pricing profile is active
which VAT is charged
which rounding rule is active
whether a quote is accepted
```

Those remain server/database decisions.

---

# 32. Email Is Not Authorization

Email notifications can inform:

```text
client
admin
chauffeur
```

but email content/state must never be used as the authoritative booking or permission source.

The database remains authoritative.

---

# 33. Common HTTP Security Responses

```text
400
→ invalid request

401
→ user must log in

403
→ logged in, but not authorized

409
→ valid request structure but current business state conflicts
   example: accepted quote cannot be voided

500
→ unexpected server/database problem
```

---

# 34. Security Layers Summary

```text
Layer 1 — UI
hide irrelevant/forbidden actions

Layer 2 — API/server
validate request
authenticate
authorize

Layer 3 — RLS/permissions
prevent direct unauthorized database operations

Layer 4 — PostgreSQL functions
repeat authoritative identity/business checks

Layer 5 — constraints/locks/transactions
prevent invalid or concurrent data state
```

No single layer should carry all responsibility.

---

# 35. Current Strong Security Patterns

Already demonstrated in the project:

```text
role-aware navigation
server-side role verification
RLS enabled on major tables
own-profile RLS policy
service-role kept server-side
financial tables blocked from browser roles
protected SECURITY DEFINER financial functions
secure chauffeur identity derivation
privacy-safe open-booking feed
row locks for booking claim
atomic booking acceptance
atomic/admin assignment workflows
quote lifecycle verification
accepted quote cannot be voided
```

---

# 36. Future Security Hardening

Before controlled public production use, plan a dedicated hardening review for:

```text
formal RLS audit
all API authorization audit
rate limiting
bot/abuse protection
password recovery
session-expiry behavior
CSRF considerations for write flows
security headers
error monitoring
database backups
secret rotation
audit logging
privacy/GDPR review
dependency/security updates
```

These are production-hardening items, separate from current feature architecture.

---

# 37. Key Learning Summary

Remember:

> **Authentication asks “Who are you?”**

> **Authorization asks “What may you do?”**

> **Supabase Auth gives the user UUID.**

> **`user_profiles` gives that UUID a Voya Taxi role.**

> **A chauffeur ID should be derived from trusted user identity whenever possible.**

> **Hiding a button is not authorization.**

> **The service role is server-only.**

> **RLS protects table access.**

> **Protected PostgreSQL functions protect multi-step business rules.**

> **Locks protect against concurrent users changing the same state.**

> **Transactions protect against partial state.**

> **Database constraints are also part of security.**

---

# 38. Maintenance Rule

Update this file whenever any of these changes:

```text
Supabase Auth setup
user_profiles
roles
RLS
API authorization
service-role usage
protected function permissions
SECURITY DEFINER functions
secret handling
ownership rules
privacy-safe data exposure
authentication/session behavior
```

/* ================================================================================================================
   PRICING MARKET PLANNED EFFECTIVE DATE

   Purpose:
   Stores the planned starting timestamp for the initial financial
   configuration generated when a new pricing market is created.

   The Add Country process will use this timestamp for the initial:
   - pricing profiles
   - tax rule
   - currency rounding rule

   Example:
   Germany planned_effective_from = 2027-01-01 00:00

   Generated configuration:
   DE pricing profiles     effective_from = 2027-01-01
   DE tax rule             effective_from = 2027-01-01
   DE rounding rule        effective_from = 2027-01-01

   Initial generated rules will use:
   effective_until = NULL

   Important:
   This column is nullable because existing markets such as NL and BE
   were already operational before the new country-onboarding process
   was introduced.

   The future create-pricing-market RPC will require this value for
   every newly onboarded country.
==================================================================================================================== */

ALTER TABLE public.pricing_markets
ADD COLUMN IF NOT EXISTS planned_effective_from TIMESTAMPTZ;


/*
So the rule becomes:
    review_required + planned date    ✅
    review_required + no planned date ❌

    ready + planned date              ✅
    ready + no planned date           ✅  ← allows existing NL / BE
*/
ALTER TABLE public.pricing_markets
ADD CONSTRAINT pricing_markets_review_requires_planned_effective_from
CHECK (
    configuration_status <> 'review_required'
    OR planned_effective_from IS NOT NULL
);

/* ---------------------------------------------------------------------------------------------------------------
   DOCUMENTATION
---------------------------------------------------------------------------------------------------------------- */

COMMENT ON COLUMN public.pricing_markets.planned_effective_from IS
'Planned starting timestamp used when generating the initial financial configuration for a newly onboarded pricing market.';
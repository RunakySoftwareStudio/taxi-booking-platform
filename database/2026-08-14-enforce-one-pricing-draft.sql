/*
 * Pricing Version - Pricing lifecycle correction
 *
 * Enforces the rule that each pricing-profile family may
 * contain at most one draft version.
 *
 * Allowed:
 *
 * 1 active version maximum
 * 1 draft version maximum
 * many archived versions
 */

CREATE UNIQUE INDEX IF NOT EXISTS
    pricing_profiles_one_draft_version_idx
ON public.pricing_profiles (
    pricing_profile_code
)
WHERE status = 'draft';
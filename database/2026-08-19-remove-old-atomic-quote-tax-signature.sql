/*
 * Purpose:
 * Removes the old atomic quote-creation RPC signature.
 *
 * The old version stored journey quote items but did not require
 * journey_quote_tax_allocations.
 *
 * The new version remains available and requires both:
 * - p_quote_items JSONB
 * - p_tax_allocations JSONB
 *
 * This ensures all newly created quotes use the tax-allocation architecture.
 */

DROP FUNCTION IF EXISTS public.create_journey_quote_with_items(
    UUID,
    UUID,
    UUID,
    UUID,
    UUID,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    JSONB
);
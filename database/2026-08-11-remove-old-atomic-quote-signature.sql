/*
 * Pricing Version - Process 2
 *
 * Removes the obsolete create_journey_quote_with_items function signature.
 *
 * The current version includes p_destination_country_code.
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
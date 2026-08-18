/* ============================================================
   ALLOW MULTI-COUNTRY JOURNEY QUOTE ITEMS

   Purpose:
   journey_quote_items describes WHAT created the commercial fare.

   For a domestic journey, one VAT rate applies to the complete
   quote, so each quote item can still store:

       vat_rate_percentage
       vat_amount
       amount_including_vat

   For a cross-border journey, one commercial item may span more
   than one country and therefore more than one tax rule.

   In that case the exact tax breakdown belongs in:

       journey_quote_tax_allocations

   The VAT-related fields on journey_quote_items may therefore
   be NULL for multi-country quotes.
============================================================ */


/*
 * A commercial quote item may not have one truthful VAT rate
 * when the journey crosses multiple tax jurisdictions.
 */
ALTER TABLE public.journey_quote_items
ALTER COLUMN vat_rate_percentage DROP NOT NULL;


/*
 * VAT for a multi-country quote is stored by country in
 * journey_quote_tax_allocations.
 */
ALTER TABLE public.journey_quote_items
ALTER COLUMN vat_amount DROP NOT NULL;


/*
 * For multi-country quote items, the item-level amount including
 * VAT cannot be represented by one single tax calculation.
 */
ALTER TABLE public.journey_quote_items
ALTER COLUMN amount_including_vat DROP NOT NULL;


COMMENT ON COLUMN public.journey_quote_items.vat_rate_percentage IS
'Single VAT rate for this commercial quote item when applicable. NULL for multi-country quotes whose tax rates are stored in journey_quote_tax_allocations.';

COMMENT ON COLUMN public.journey_quote_items.vat_amount IS
'VAT amount for this quote item when one item-level VAT calculation applies. NULL for multi-country quotes whose VAT is allocated by country.';

COMMENT ON COLUMN public.journey_quote_items.amount_including_vat IS
'Item amount including VAT when one item-level VAT calculation applies. NULL for multi-country quotes whose VAT is calculated separately in journey_quote_tax_allocations.';
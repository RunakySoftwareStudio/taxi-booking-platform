   /* ============================================================
      VOYA TAXI — SERVICE FEE CLOSURE TRACKING

      Purpose:
      Record why a service-fee period was closed.

      Business rules:
      1. NULL means the rate is open-ended.
      2. 'replaced' means another rate replaced this rate.
      3. 'manual' means Admin intentionally ended the rate.
      4. A rate may only have a closure reason when it has
         an effective end date.
      5. An ended rate must have a closure reason.

      Historical financial rates must remain protected.
   ============================================================ */

   /* SECTION 1 — Add closure reason to service-fee rates. */
   ALTER TABLE public.financial_service_fee_rates
   ADD COLUMN closure_reason TEXT NULL;

   /* SECTION 2 — Restrict closure reasons to valid values. */
   ALTER TABLE public.financial_service_fee_rates
   ADD CONSTRAINT financial_service_fee_closure_reason_valid
   CHECK (
      (effective_until IS NULL AND closure_reason IS NULL)
      OR
      (effective_until IS NOT NULL
      AND closure_reason IN ('system_ended', 'admin_ended'))
   );

   /* SECTION 3 — Document the new column. */
   COMMENT ON COLUMN public.financial_service_fee_rates.closure_reason IS
   'NULL for open-ended rates; system_ended when automatically closed by scheduling a new rate; admin_ended when intentionally ended by Admin.';
    /* ======================================================================================================
    END VOYA TAXI — SERVICE FEE CLOSURE TRACKING
    =====================================================================================================*/
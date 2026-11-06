
    /*============================================================
        VOYA TAXI — SERVICE-FEE RATE HISTORY PROTECTION

        Preserve historical service-fee rates while allowing
        controlled future rate scheduling and restoration.
    ==============================================================*/

    CREATE OR REPLACE FUNCTION public.protect_service_fee_rate_history()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $$
    DECLARE
        v_today DATE;
    BEGIN
        v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* SECTION 1: Historical and active rates cannot be deleted. */
        IF TG_OP = 'DELETE' THEN
            IF OLD.effective_from <= v_today THEN
                RAISE EXCEPTION
                    'Historical or active service-fee rates cannot be deleted.'
                USING ERRCODE = '22023';
            END IF;

            RETURN OLD;
        END IF;

        /* SECTION 2: Preserve rate identity and financial meaning. */
        IF ROW(
            NEW.id,
            NEW.chauffeur_id,
            NEW.percentage,
            NEW.effective_from,
            NEW.created_at
        ) IS DISTINCT FROM ROW(
            OLD.id,
            OLD.chauffeur_id,
            OLD.percentage,
            OLD.effective_from,
            OLD.created_at
        ) THEN
            RAISE EXCEPTION
                'Service-fee rate identity and percentage cannot be changed.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 3: No changes to the rate period. */
        IF NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until
        AND NEW.closure_reason IS NOT DISTINCT FROM OLD.closure_reason THEN
            RETURN NEW;
        END IF;

        /* SECTION 4: Allow closing an open rate on a future date. */
        IF OLD.effective_until IS NULL
        AND NEW.effective_until > v_today
        AND NEW.closure_reason = 'system_ended' THEN
            RETURN NEW;
        END IF;

        /* SECTION 5: Allow restoring a future system-closed period. */
        IF OLD.effective_until > v_today
        AND OLD.closure_reason = 'system_ended'
        AND NEW.effective_until IS NULL
        AND NEW.closure_reason IS NULL THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION
            'Service-fee rate period cannot be modified.'
        USING ERRCODE = '22023';
    END;
    $$;

    /* Install the protection on the rate table. */
    CREATE TRIGGER protect_service_fee_rate_history
    BEFORE UPDATE OR DELETE
    ON public.financial_service_fee_rates
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_service_fee_rate_history();
    /*============================================================
        END VOYA TAXI — SERVICE-FEE RATE HISTORY PROTECTION
    ==============================================================*/

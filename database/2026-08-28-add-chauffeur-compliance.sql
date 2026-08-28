/* ============================================================
   CHAUFFEUR VERIFICATION STATUS

   Purpose:
   Describes whether Voya Taxi has verified the chauffeur's
   professional and compliance requirements.

   This is intentionally separate from:
   - account_status
   - operational_status
============================================================ */

CREATE TYPE public.chauffeur_verification_status AS ENUM (
    'pending_verification',
    'verified',
    'suspended',
    'inactive'
);


/* ============================================================
   CHAUFFEUR COMPLIANCE

   Purpose:
   Stores sensitive chauffeur compliance and verification data.

   Operational/profile data remains in public.chauffeurs.

   One chauffeur can have only one compliance record.
============================================================ */

CREATE TABLE public.chauffeur_compliance (
    chauffeur_id UUID PRIMARY KEY
        REFERENCES public.chauffeurs(id)
        ON DELETE CASCADE,

    /* ===== Sensitive personal identification ===== */

    /*
       BSN is stored as TEXT so leading zeroes are preserved.

       This field must remain protected and should only be populated
       when Voya has a lawful reason to process the BSN.
    */
    bsn TEXT UNIQUE
        CHECK (
            bsn IS NULL
            OR bsn ~ '^[0-9]{9}$'
        ),

    /* ===== Driving licence ===== */

    driving_license_valid_until DATE,
    driving_license_checked_at TIMESTAMPTZ,

    /* ===== Chauffeurskaart taxi ===== */

    chauffeur_card_number TEXT UNIQUE,
    chauffeur_card_valid_until DATE,
    chauffeur_card_checked_at TIMESTAMPTZ,

    /* ===== Identity document verification ============================== 
        Why two country codes?
        nationality_country_code = nationality of the chauffeur.
        identity_document_issuing_country_code = country that issued the passport/ID.
    */
    date_of_birth DATE,
    nationality_country_code TEXT
        CHECK (
            nationality_country_code IS NULL
            OR (
                nationality_country_code = upper(nationality_country_code)
                AND length(nationality_country_code) = 2
            )
        ),
    identity_document_type TEXT,
    identity_document_number TEXT,
    identity_document_issuing_country_code TEXT
        CHECK (
            identity_document_issuing_country_code IS NULL
            OR (
                    identity_document_issuing_country_code = upper(identity_document_issuing_country_code)
                    AND length(identity_document_issuing_country_code) = 2 
            )
        ),
    identity_document_valid_until DATE,
    identity_checked_at TIMESTAMPTZ,

    /* ===== Residence / work eligibility ===== */
    residence_permit_required BOOLEAN,
    residence_permit_type TEXT,
    residence_permit_valid_until DATE,
    residence_permit_checked_at TIMESTAMPTZ,

    work_authorization_required BOOLEAN,
    work_authorization_type TEXT,
    work_authorization_valid_until DATE,
    work_authorization_checked_at TIMESTAMPTZ,

    /* ===== VOG ===== */
    vog_issued_on DATE,
    vog_checked_at TIMESTAMPTZ,

    /* ===== Medical certificate ===== */
    medical_certificate_issued_on DATE,
    medical_checked_at TIMESTAMPTZ,

    /* ===== Employment relationship ===== */
    employment_relationship_type TEXT,
    employment_confirmed BOOLEAN,
    employment_checked_at TIMESTAMPTZ,
    employment_start_date DATE,
    employment_end_date DATE,

    /* ===== Chauffeur verification ===== */

    verification_status public.chauffeur_verification_status
        NOT NULL DEFAULT 'pending_verification',

    verification_status_reason TEXT,

    verification_status_changed_at TIMESTAMPTZ
        NOT NULL DEFAULT now(),

    verification_status_changed_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    /* Records the successful verification itself. */
    verified_at TIMESTAMPTZ,

    verified_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    /* ===== System timestamps ===== */

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (
        employment_end_date IS NULL
        OR employment_start_date IS NULL
        OR employment_end_date >= employment_start_date
    )
);


/* ============================================================
   INDEXES

   Expiry-date indexes support the future manual Admin
   "Check all chauffeur documents" action efficiently.
============================================================ */

CREATE INDEX chauffeur_compliance_verification_status_idx
ON public.chauffeur_compliance(verification_status);

CREATE INDEX chauffeur_compliance_driving_license_expiry_idx
ON public.chauffeur_compliance(driving_license_valid_until);

CREATE INDEX chauffeur_compliance_chauffeur_card_expiry_idx
ON public.chauffeur_compliance(chauffeur_card_valid_until);

CREATE INDEX chauffeur_compliance_residence_permit_expiry_idx
ON public.chauffeur_compliance(residence_permit_valid_until);

CREATE INDEX chauffeur_compliance_work_authorization_expiry_idx
ON public.chauffeur_compliance(work_authorization_valid_until);

/* ============================================================
   UPDATED_AT TRIGGER
============================================================ */

CREATE TRIGGER update_chauffeur_compliance_updated_at
BEFORE UPDATE ON public.chauffeur_compliance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* ============================================================
   EXISTING CHAUFFEURS

   Creates an empty compliance record for chauffeurs that already
   existed before this migration.
============================================================ */

INSERT INTO public.chauffeur_compliance (chauffeur_id)
SELECT id
FROM public.chauffeurs
ON CONFLICT (chauffeur_id) DO NOTHING;


/* ============================================================
   NEW CHAUFFEURS

   Automatically creates one empty compliance record whenever
   a new chauffeur is created.
============================================================ */

CREATE OR REPLACE FUNCTION public.create_chauffeur_compliance_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.chauffeur_compliance (chauffeur_id)
    VALUES (NEW.id)
    ON CONFLICT (chauffeur_id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER create_chauffeur_compliance_after_insert
AFTER INSERT ON public.chauffeurs
FOR EACH ROW
EXECUTE FUNCTION public.create_chauffeur_compliance_record();


/* ============================================================
   ROW LEVEL SECURITY

   Sensitive compliance data must not be directly available to
   anonymous/authenticated browser clients.

   Controlled application operations use server-side access.
============================================================ */

ALTER TABLE public.chauffeur_compliance ENABLE ROW LEVEL SECURITY;
/* ============================================================
   CHAUFFEUR DOCUMENT TYPE

   Purpose:
   Identifies the compliance document stored for a chauffeur.
============================================================ */

CREATE TYPE public.chauffeur_document_type AS ENUM (
    'identity_document',
    'driving_license',
    'chauffeur_card',
    'taxi_diploma',
    'vog',
    'medical_certificate',
    'residence_permit',
    'work_authorization',
    'employment_contract',
    'other'
);


/* ============================================================
   CHAUFFEUR DOCUMENT VERIFICATION STATUS

   Expiry is intentionally not stored here.
   Whether a document is expired will be derived from valid_until.
============================================================ */

CREATE TYPE public.chauffeur_document_verification_status AS ENUM (
    'pending_review',
    'verified',
    'rejected',
    'superseded'
);


/* ============================================================
   CHAUFFEUR DOCUMENTS

   Purpose:
   Stores metadata for private chauffeur compliance documents.

   The actual file is stored in the private Supabase Storage
   bucket "chauffeur-documents".

   Multiple rows per document type are allowed so replacement
   documents retain their history.
============================================================ */

CREATE TABLE public.chauffeur_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chauffeur_id UUID NOT NULL
        REFERENCES public.chauffeurs(id)
        ON DELETE CASCADE,

    document_type public.chauffeur_document_type NOT NULL,

    /* ===== Private Storage metadata ===== */

    storage_path TEXT NOT NULL UNIQUE
        CHECK (length(trim(storage_path)) > 0),

    original_file_name TEXT NOT NULL
        CHECK (length(trim(original_file_name)) > 0),

    mime_type TEXT NOT NULL
        CHECK (length(trim(mime_type)) > 0),

    file_size_bytes BIGINT NOT NULL
        CHECK (file_size_bytes > 0),

    /* ===== Document validity ===== */

    valid_from DATE,
    valid_until DATE,

    CHECK (
        valid_until IS NULL
        OR valid_from IS NULL
        OR valid_until >= valid_from
    ),

    /* ===== Document verification ===== */

    verification_status public.chauffeur_document_verification_status
        NOT NULL DEFAULT 'pending_review',

    verification_reason TEXT,
    verification_status_changed_at TIMESTAMPTZ
        NOT NULL DEFAULT now(),

    verification_status_changed_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    verified_at TIMESTAMPTZ,

    verified_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    /* ===== Upload audit ===== */

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    uploaded_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


/* ============================================================
   INDEXES
============================================================ */

CREATE INDEX chauffeur_documents_chauffeur_idx
ON public.chauffeur_documents(chauffeur_id);

CREATE INDEX chauffeur_documents_type_idx
ON public.chauffeur_documents(document_type);

CREATE INDEX chauffeur_documents_verification_status_idx
ON public.chauffeur_documents(verification_status);

CREATE INDEX chauffeur_documents_valid_until_idx
ON public.chauffeur_documents(valid_until);


/* ============================================================
   UPDATED_AT TRIGGER
============================================================ */

CREATE TRIGGER update_chauffeur_documents_updated_at
BEFORE UPDATE ON public.chauffeur_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* ============================================================
   ROW LEVEL SECURITY

   Compliance documents are private.

   No anonymous/authenticated browser policies are created here.
   Controlled access will go through protected server APIs.
============================================================ */

ALTER TABLE public.chauffeur_documents ENABLE ROW LEVEL SECURITY;
-- Enable UUID generation . We want every database row to have a unique ID like this:
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Supports exclusion constraints combining UUID equality with time ranges.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Booking status values used by the platform
CREATE TYPE booking_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'confirmed',
  'completed',
  'cancelled'
);

-- Clients who request taxi trips
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Prevent duplicate clients with the same email address.
-- This treats uppercase/lowercase and extra spaces as the same email.
create unique index if not exists clients_unique_normalized_email
on clients (lower(trim(email)))
where email is not null and trim(email) <> '';

-- Chauffeur account status values
/*
    pending_approval = chauffeur registered but admin has not approved yet
    approved = chauffeur can receive bookings
    suspended = chauffeur is blocked temporarily
    inactive = chauffeur account is not active
*/

CREATE TYPE chauffeur_account_status AS ENUM (
  'pending_approval',
  'approved',
  'suspended',
  'inactive'
);

-- Chauffeurs who can receive taxi bookings
CREATE TABLE chauffeurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  company_name TEXT,
  license_number TEXT,
  service_area TEXT,
  account_status chauffeur_account_status NOT NULL DEFAULT 'pending_approval',
  rating NUMERIC(2, 1) DEFAULT 0.0,
  accepts_pets boolean not null default false,
  bio TEXT,
  profile_photo_path TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Stores chauffeur requests for changes to administrator-controlled information.
create table if not exists public.chauffeur_change_requests (
    id uuid primary key default gen_random_uuid(),
    chauffeur_id uuid not null references public.chauffeurs(id) on delete cascade,
    field_name text not null check (field_name in ('name', 'email', 'company_name', 'license_number')),
    current_value text,
    requested_value text not null check (length(trim(requested_value)) > 0),
    reason text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz
);


-- Vehicle types available on the platform
CREATE TYPE vehicle_type AS ENUM (
  'standard',
  'business',
  'luxury',
  'van',
  'minibus',
  'wheelchair'
);

/*
    -- Describes how a vehicle can transport a wheelchair.
    Meaning of wheelchair support
    none→ vehicle has no wheelchair support
    foldable_only
        → wheelchair can be folded and stored
        → passenger sits in a normal vehicle seat
    ramp
        → passenger may remain in the wheelchair
        → vehicle has a wheelchair ramp
    lift
        → passenger may remain in the wheelchair
        → vehicle has a mechanical wheelchair lift
*/

CREATE TYPE wheelchair_access_type AS ENUM (
  'none',
  'foldable_only',
  'ramp',
  'lift'
);

/* -- Vehicles used by chauffeurs
    infant_seat_count→ rear-facing baby seat
    child_seat_count→ normal child safety seat
    booster_seat_count→ booster seat for an older child
    isofix_available→ vehicle has ISOFIX attachment points
    Infant seat
        → for babies
        → usually rear-facing
    Child seat
            → has its own harness
            → for younger children
    Booster seat
            → no built-in harness in most cases
            → uses the vehicle’s normal seat belt
            → raises an older child to the correct height
*/
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id UUID NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  license_plate TEXT NOT NULL UNIQUE,
  vehicle_type vehicle_type NOT NULL DEFAULT 'standard',
  seats INTEGER NOT NULL DEFAULT 4,
  luggage_capacity INTEGER NOT NULL DEFAULT 2,

  -- Number of child-safety seats supplied by the vehicle.
  infant_seat_count INTEGER NOT NULL DEFAULT 0,
  child_seat_count INTEGER NOT NULL DEFAULT 0,
  booster_seat_count INTEGER NOT NULL DEFAULT 0,
  isofix_available BOOLEAN NOT NULL DEFAULT FALSE,

  -- Wheelchair and mobility-aid support.
  wheelchair_access wheelchair_access_type NOT NULL DEFAULT 'none',
  wheelchair_capacity INTEGER NOT NULL DEFAULT 0,
  mobility_aid_storage BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indicates whether the vehicle can carry unusually large luggage.
  extra_large_luggage BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Prevents negative capability values.
  CONSTRAINT vehicles_infant_seat_count_valid
    CHECK (infant_seat_count >= 0),

  CONSTRAINT vehicles_child_seat_count_valid
    CHECK (child_seat_count >= 0),

  CONSTRAINT vehicles_booster_seat_count_valid
    CHECK (booster_seat_count >= 0),

  CONSTRAINT vehicles_wheelchair_capacity_valid
    CHECK (wheelchair_capacity >= 0),

  /*
    none or foldable_only means the passenger cannot remain seated
    in the wheelchair, so wheelchair_capacity must be zero.

    ramp or lift means the vehicle can transport at least one
    passenger who remains seated in a wheelchair.
  */
  CONSTRAINT vehicles_wheelchair_access_consistent
    CHECK (
      (
        wheelchair_access IN ('none', 'foldable_only')
        AND wheelchair_capacity = 0
      )
      OR
      (
        wheelchair_access IN ('ramp', 'lift')
        AND wheelchair_capacity >= 1
      )
    )
);
-- Trip types available in the booking form
CREATE TYPE trip_type AS ENUM (
  'one-way',
  'return',
  'airport',
  'business',
  'hourly'
);

-- Chauffeur availability status values
CREATE TYPE availability_status AS ENUM (
  'available',
  'busy',
  'offline',
  'holiday'
);

-- Chauffeur availability schedule
CREATE TABLE IF NOT EXISTS chauffeur_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chauffeur_id UUID NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
    booking_id UUID,
    available_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status availability_status NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

/*
  Defines how a passenger's wheelchair must be transported.
  none:  
    No wheelchair transport is required.
  foldable:  
    The passenger transfers to a normal seat and the folded wheelchair  is stored inside the vehicle.
  remain_in_wheelchair:
    One or more passengers remain seated in their wheelchairs.
    The assigned vehicle must provide ramp or lift access.
*/
CREATE TYPE public.wheelchair_requirement_type AS ENUM (
    'none',
    'foldable',
    'remain_in_wheelchair'
);

-- Taxi trip booking requests
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    chauffeur_id UUID REFERENCES chauffeurs(id) ON DELETE SET NULL, /*A booking can exist without a chauffeur at first.*/

    pickup_location TEXT NOT NULL,
    destination TEXT NOT NULL,
    pickup_date DATE NOT NULL,
    pickup_time TIME NOT NULL,
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 60,
    passengers INTEGER NOT NULL DEFAULT 1,
    luggage INTEGER DEFAULT 0,

    infant_seat_count_required INTEGER NOT NULL DEFAULT 0,
    child_seat_count_required INTEGER NOT NULL DEFAULT 0,
    booster_seat_count_required INTEGER NOT NULL DEFAULT 0,
    isofix_required BOOLEAN NOT NULL DEFAULT FALSE,
    wheelchair_requirement public.wheelchair_requirement_type NOT NULL DEFAULT 'none',
    wheelchair_passenger_count INTEGER NOT NULL DEFAULT 0,
    mobility_aid_storage_required BOOLEAN NOT NULL DEFAULT FALSE,
    extra_large_luggage_required BOOLEAN NOT NULL DEFAULT FALSE,

    trip_type trip_type NOT NULL,
    notes TEXT,
    status booking_status NOT NULL DEFAULT 'pending',
    has_pets BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT bookings_infant_seat_count_required_valid
        CHECK (infant_seat_count_required >= 0),

    CONSTRAINT bookings_child_seat_count_required_valid
        CHECK (child_seat_count_required >= 0),

    CONSTRAINT bookings_booster_seat_count_required_valid
        CHECK (booster_seat_count_required >= 0),

    CONSTRAINT bookings_wheelchair_passenger_count_valid
        CHECK (wheelchair_passenger_count >= 0),

    /*
      none and foldable require zero passengers remaining in a wheelchair.

      remain_in_wheelchair requires at least one wheelchair passenger.
    */
    CONSTRAINT bookings_wheelchair_requirement_consistent
        CHECK (
            (
                wheelchair_requirement IN ('none', 'foldable')
                AND wheelchair_passenger_count = 0
            )
            OR
            (
                wheelchair_requirement = 'remain_in_wheelchair'
                AND wheelchair_passenger_count >= 1
            )
        )
);

-- Connects booking-created busy periods to their booking.
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_booking_id_fkey
FOREIGN KEY (booking_id)
REFERENCES bookings(id)
ON DELETE CASCADE;

-- Booking-linked availability periods must always use the busy status.
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_booking_status_check
CHECK (booking_id IS NULL OR status = 'busy');
--===================================================================
-- Indexes for faster searching
CREATE INDEX idx_bookings_client_id ON bookings(client_id); /* Find all bookings from one client */
CREATE INDEX idx_bookings_chauffeur_id ON bookings(chauffeur_id); /* Find all bookings assigned to one chauffeur */
CREATE INDEX idx_bookings_status ON bookings(status); /* Find pending/confirmed/cancelled bookings */
CREATE INDEX idx_bookings_pickup_date ON bookings(pickup_date); /* Find bookings for a date  */

CREATE INDEX idx_vehicles_chauffeur_id ON vehicles(chauffeur_id); /* Find vehicles for a chauffeur */

CREATE INDEX idx_chauffeur_availability_chauffeur_id ON chauffeur_availability(chauffeur_id); /* Find availability for a chauffeur */

CREATE INDEX idx_chauffeur_availability_date ON chauffeur_availability(available_date); /* Find chauffeurs available on a date */

-- Speeds up requests belonging to one chauffeur.
create index if not exists chauffeur_change_requests_chauffeur_id_idx on public.chauffeur_change_requests(chauffeur_id);

-- Allows only one pending request per chauffeur and protected field.
create unique index if not exists chauffeur_change_requests_one_pending_field_idx on public.chauffeur_change_requests(chauffeur_id, field_name) where status = 'pending';

-- Finds booking-created busy periods quickly.
CREATE INDEX chauffeur_availability_booking_id_idx
ON chauffeur_availability(booking_id)
WHERE booking_id IS NOT NULL;

-- Prevents duplicate busy periods for the same booking.
CREATE UNIQUE INDEX chauffeur_availability_booking_period_unique
ON chauffeur_availability(
    booking_id,
    available_date,
    start_time,
    end_time
)
WHERE booking_id IS NOT NULL;
--=================================================================================================
-- Data validation rules
--=================================================================================================
ALTER TABLE bookings
ADD CONSTRAINT bookings_passengers_positive
CHECK (passengers > 0);

-----------------------------------------------------
-- Luggage cannot be negative
-----------------------------------------------------
ALTER TABLE bookings
ADD CONSTRAINT bookings_luggage_not_negative
CHECK (luggage >= 0);

-----------------------------------------------------
-- Booking duration must be between 15 minutes and 24 hours.
-----------------------------------------------------
ALTER TABLE bookings
ADD CONSTRAINT bookings_estimated_duration_minutes_check
CHECK (estimated_duration_minutes BETWEEN 15 AND 1440);

-----------------------------------------------------
-- Rating must be between 0 and 5
-----------------------------------------------------
ALTER TABLE chauffeurs
ADD CONSTRAINT chauffeurs_rating_range
CHECK (rating >= 0.0 AND rating <= 5.0);

-----------------------------------------------------
-- Vehicle must have seats
-----------------------------------------------------
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_seats_positive
CHECK (seats > 0);

-----------------------------------------------------
-- Vehicle luggage capacity cannot be negative
-----------------------------------------------------
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_luggage_capacity_not_negative
CHECK (luggage_capacity >= 0);

-----------------------------------------------------
-- Availability end time must be after start time
-----------------------------------------------------
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_time_order
CHECK (end_time > start_time);

/*-----------------------------------------------------
  -- Prevents overlapping busy periods for the same chauffeur.
  -- Two busy rows cannot have the same chauffeur_id when their time ranges overlap.
  This part:
    chauffeur_id with =,
    tsrange(...) with &&
    means PostgreSQL rejects a row only when both conditions are true:

  The chauffeur IDs are equal AND the time ranges overlap

  For example:
    Same chauffeur + overlapping time  → rejected
    Same chauffeur + separate time     → allowed
    Different chauffeur + same time    → allowed
*/
-----------------------------------------------------
alter table public.chauffeur_availability
-- Adds a new database rule with this name.
add constraint chauffeur_availability_no_overlapping_busy
-- An exclusion constraint compares a new row with existing rows.
-- GiST allows PostgreSQL to efficiently compare UUID values and time ranges.
exclude using gist (
    -- Compare chauffeur IDs using equality =.
    chauffeur_id with =,
    -- Create a timestamp range by combining the date with the start and end times.
    -- Example: 2026-07-20 14:00 until 2026-07-20 15:00.
    tsrange(
        available_date + start_time,
        available_date + end_time,
        -- [ means the start is included.
        -- ) means the end is excluded.
        -- Therefore, 14:00–15:00 and 15:00–16:00 do not overlap.
        '[)'
    )
    -- && means that two timestamp ranges overlap.
    -- Example: 14:00–15:00 overlaps with 14:30–15:30.
    with &&
)
-- Apply this exclusion rule only to rows with the busy status.
where (status = 'busy');

-----------------------------------------------------
-- Vehicle validation year
-----------------------------------------------------
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_year_valid
CHECK (vehicle_year IS NULL OR (vehicle_year >= 1980 AND vehicle_year <= 2100));

-----------------------------------------------------
-- Limits the public chauffeur biography.
-----------------------------------------------------
ALTER TABLE public.chauffeurs ADD CONSTRAINT chauffeurs_bio_length CHECK (bio IS NULL OR length(bio) <= 1000);

-----------------------------------------------------
-- Limits the stored Supabase Storage path.
-----------------------------------------------------
ALTER TABLE public.chauffeurs ADD CONSTRAINT chauffeurs_profile_photo_path_length CHECK (profile_photo_path IS NULL OR length(profile_photo_path) <= 500);
--===================================================================


/* Automatically update updated_at columns */
/* 
    1. This creates a PostgreSQL function named:update_updated_at_column
    2. The $$ is just a PostgreSQL way to mark the start and end of the function body.
    
    Function = what should happen
    Trigger = when it should happen
*/
CREATE OR REPLACE FUNCTION update_updated_at_column() /* If this function already exists, replace it with this new version.*/
RETURNS TRIGGER AS $$ -- trigger function, mot normal function that returns text, number, or table data.
BEGIN
  NEW.updated_at = now(); -- NEW = the new version of the existing row. OLD = the old version of the row.  Set updated_at to the current time before an existing row is updated.
  RETURN NEW; --Save this new changed version of the row. 
END; --This ends the function logic.
$$ LANGUAGE plpgsql; -- PL/pgSQL is PostgreSQL’s procedural language, used for functions, triggers, loops, conditions, and database logic.

/* Apply updated_at trigger to clients */
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON clients -- before an existing row is updated. So it runs only when an existing row is updated.
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to chauffeurs */
CREATE TRIGGER update_chauffeurs_updated_at
BEFORE UPDATE ON chauffeurs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to vehicles */
CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to bookings */
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to chauffeur availability */
CREATE TRIGGER update_chauffeur_availability_updated_at
BEFORE UPDATE ON chauffeur_availability
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Automatically updates updated_at when a change request is modified.
CREATE TRIGGER update_chauffeur_change_requests_updated_at
BEFORE UPDATE ON public.chauffeur_change_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
--===================================================================
/* Enable Row Level Security */
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeur_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chauffeur_change_requests ENABLE ROW LEVEL SECURITY;

/*======================================================================*/
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    chauffeur_id UUID REFERENCES chauffeurs(id) ON DELETE SET NULL,
    -- Stores only a supported Voya Taxi interface language.
    preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'nl', 'ar', 'tr', 'fa')),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT user_profiles_chauffeur_role_check
    CHECK (
      (role = 'admin' AND chauffeur_id IS NULL)
      OR
      (role = 'chauffeur' AND chauffeur_id IS NOT NULL)
    )
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

--===================================================================
/* create a function to get data from enumrated types */
-- you can call a function in his way: SELECT get_enum_values('booking_status');
-- in supasql:  const { data: availabilityStatuses, error } = await supabaseAdmin.rpc( "get_enum_values", { p_enum_type_name: "availability_status",});
/* Get enum values by enum type name 
------------------------------------------------------------------*/
CREATE OR REPLACE FUNCTION public.get_enum_values(p_enum_type_name text)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    array_agg(e.enumlabel::text ORDER BY e.enumsortorder),
    ARRAY[]::text[]
  )
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typname = p_enum_type_name
    AND n.nspname = 'public';
$$;
/*===========================================================
=============================================================*/
DO $$
BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'chauffeur');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


/* ============================================================
   FUNCTION PURPOSE

   This function updates the chauffeur and status of one booking.
   It also keeps chauffeur_availability synchronized:
   - accepted, confirmed or completed:
       create a linked busy period
   - pending, rejected or cancelled:
       remove the linked busy period
   Everything runs inside one PostgreSQL transaction.
   If one part fails, PostgreSQL reverses all changes made by
   this function. This prevents partially updated booking data.
----------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.update_booking_admin_assignment(
    p_booking_id UUID,
    p_chauffeur_id UUID,
    p_status public.booking_status
)
/*-------------------------------
RETURNS VOID
it does not return booking data. We mainly inspect whether an error occurred:
const { error } = await supabaseAdmin.rpc(...);
When successful:error = null
--------------------------------*/
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    /* -----------------------------------------------------------
       LOCAL VARIABLES
       These variables temporarily store information belonging
       to the selected booking.
       v_ means "variable".
       They exist only while this function is running.
    -----------------------------------------------------------*/

    -- Stores the booking pickup date.
    v_pickup_date DATE;
    -- Stores the booking pickup time.
    v_pickup_time TIME WITHOUT TIME ZONE;
    -- Stores the Mapbox-calculated journey duration.
    v_duration_minutes INTEGER;
    -- Stores the calculated complete end date and time.
    v_end_at TIMESTAMP WITHOUT TIME ZONE;

BEGIN
    /* -----------------------------------------------------------
       SECTION 1: READ AND LOCK THE BOOKING
       SELECT reads the booking information from public.bookings.
       INTO places the selected database values inside the local
       variables declared above.
       FOR UPDATE locks this booking row until the transaction  finishes.
       This prevents two admin actions from changing the same  booking simultaneously.
    ----------------------------------------------------------- */
    SELECT
        pickup_date,
        pickup_time,
        estimated_duration_minutes
    INTO
        v_pickup_date,
        v_pickup_time,
        v_duration_minutes
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    /* -----------------------------------------------------------
       SECTION 2: CHECK THAT THE BOOKING EXISTS
       FOUND is a special PostgreSQL variable.
       FOUND is TRUE when the previous SELECT found a booking.
       FOUND is FALSE when no booking matched p_booking_id.
       RAISE EXCEPTION stops the function immediately.
       P0002 means that requested data was not found.
    ----------------------------------------------------------- */
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* -----------------------------------------------------------
       SECTION 3: REQUIRE A CHAUFFEUR FOR ACTIVE BOOKINGS
       An accepted, confirmed or completed booking must have an  assigned chauffeur.
       IN checks whether p_status matches one of the listed booking statuses.
       IS NULL checks whether no chauffeur was supplied.
       Both conditions must be TRUE before the exception occurs:
       active booking status  AND no assigned chauffeur
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed')
       AND p_chauffeur_id IS NULL THEN

        RAISE EXCEPTION
            'An accepted, confirmed or completed booking requires a chauffeur.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
       SECTION 4: CALCULATE THE JOURNEY END TIME

       First PostgreSQL combines:
           pickup date + pickup time
       Example:
           2026-07-20 + 14:00  becomes  2026-07-20 14:00
       make_interval creates a time interval from the calculated journey duration.
       Example:
           duration = 51 minutes
           2026-07-20 14:00 + 51 minutes
           becomes
           2026-07-20 14:51
    ----------------------------------------------------------- */
    v_end_at :=
        v_pickup_date
        + v_pickup_time
        + make_interval(mins => v_duration_minutes);

    /* -----------------------------------------------------------
       SECTION 5: PREVENT AN OVERNIGHT BUSY PERIOD
       The current chauffeur_availability table stores:
           one available_date
           one start_time
           one end_time
       It cannot yet correctly represent a period such as:  2026-07-20 23:30  until    2026-07-21 00:30
       v_end_at::DATE extracts only the date from the calculated  end timestamp.
       When the end date differs from the pickup date, the journey crosses midnight.
       For now, the function stops instead of saving incorrect  availability information.
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed')
       AND v_end_at::DATE <> v_pickup_date THEN

        RAISE EXCEPTION
            'The calculated busy period crosses midnight.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
       SECTION 6: REMOVE THE OLD LINKED BUSY PERIOD
       A booking may already have a busy-period record.
       This can happen when:
       - the admin changes the chauffeur
       - the booking status changes
       - the assignment is saved again

       The booking_id column links the availability record to
       its booking.
       Removing the old record prevents duplicate busy periods.
       Important:
       Because this function runs inside one transaction, the
       deleted record is automatically restored when a later
       command fails.
    ----------------------------------------------------------- */
    DELETE FROM public.chauffeur_availability
    WHERE booking_id = p_booking_id;

    /* -----------------------------------------------------------
       SECTION 7: UPDATE THE BOOKING
       This changes two columns in public.bookings:
       chauffeur_id:
           the selected chauffeur, or NULL when unassigned
       status:
           the selected booking status
       WHERE ensures that only the requested booking is updated.
    ----------------------------------------------------------- */
    UPDATE public.bookings
    SET
        chauffeur_id = p_chauffeur_id,
        status = p_status
    WHERE id = p_booking_id;

    /* -----------------------------------------------------------
       SECTION 8: CREATE A NEW BUSY PERIOD
       Only active booking statuses create a busy period:
       - accepted
       - confirmed
       - completed
       Pending, rejected and cancelled bookings do not create  a busy period.
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed') THEN

        /* -----------------------------------------------------------
           INSERT creates a new chauffeur_availability record.
           chauffeur_id:
               chauffeur assigned to the booking
           available_date:
               booking pickup date
           start_time:
               booking pickup time
           end_time:
               calculated journey end time
           status:
               busy
           booking_id:
               links this availability record to the booking
        ----------------------------------------------------------- */
        INSERT INTO public.chauffeur_availability (
            chauffeur_id,
            available_date,
            start_time,
            end_time,
            status,
            booking_id
        )
        VALUES (
            p_chauffeur_id,
            v_pickup_date,
            v_pickup_time,

            -- ::TIME removes the date and keeps only the time.
            v_end_at::TIME,

            'busy',
            p_booking_id
        );

    END IF;

    /* -----------------------------------------------------------
       END OF FUNCTION
       No RETURN value is required because the function uses:
           RETURNS VOID
       Successful completion means that both the booking and its
       linked busy period were updated correctly.
    ----------------------------------------------------------- */
END;
$$;
/*===========================================================
=============================================================*/

/* ============================================================
   FUNCTION PURPOSE

   Updates all editable booking and client information.

   It also calls update_booking_admin_assignment(), which keeps
   the booking status, assigned chauffeur and linked busy period
   synchronized.

   Because everything runs inside one PostgreSQL transaction:

   - all changes succeed together;
   - or all changes are reversed together.

   This prevents partially updated booking information.
============================================================ */
CREATE OR REPLACE FUNCTION public.update_booking_admin_details(
    p_booking_id UUID,
    p_client_name TEXT,
    p_client_email TEXT,
    p_client_phone TEXT,
    p_pickup_location TEXT,
    p_destination TEXT,
    p_pickup_date DATE,
    p_pickup_time TIME WITHOUT TIME ZONE,
    p_passengers INTEGER,
    p_luggage INTEGER,
    p_trip_type public.trip_type,
    p_notes TEXT,
    p_has_pets BOOLEAN,
    p_chauffeur_id UUID,
    p_status public.booking_status
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    /* ========================================================
       Stores the client ID belonging to the selected booking.

       v_ means that this is a local function variable.
    ======================================================== */
    v_client_id UUID;

BEGIN
    /* ========================================================
       SECTION 1: FIND AND LOCK THE BOOKING

       The booking contains the client_id that tells us which
       client record must be updated.

       INTO stores client_id inside v_client_id.

       FOR UPDATE locks the booking until this complete database
       transaction finishes. This prevents two admin changes from
       editing the same booking simultaneously.
    ======================================================== */
    SELECT client_id
    INTO v_client_id
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;


    /* ========================================================
       SECTION 2: CHECK THAT THE BOOKING EXISTS

       FOUND is a special PostgreSQL value.

       TRUE:
           the previous SELECT found a row.

       FALSE:
           the booking ID did not exist.

       RAISE EXCEPTION stops the function.
    ======================================================== */
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;


    /* ========================================================
       SECTION 3: UPDATE THE CLIENT

       The client_id stored in v_client_id identifies the client
       belonging to this booking.

       This preserves the current project behaviour: editing the
       client information updates the existing client record.
    ======================================================== */
    UPDATE public.clients
    SET
        name = p_client_name,
        email = p_client_email,
        phone = p_client_phone
    WHERE id = v_client_id;


    /* ========================================================
       SECTION 4: UPDATE THE BOOKING DETAILS

       This section updates trip information such as:

       - pickup and destination;
       - date and time;
       - passengers and luggage;
       - trip type;
       - notes;
       - pet information.

       Status and chauffeur_id are not updated here.

       They are handled by update_booking_admin_assignment()
       because that function also manages the busy period.
    ======================================================== */
    UPDATE public.bookings
    SET
        pickup_location = p_pickup_location,
        destination = p_destination,
        pickup_date = p_pickup_date,
        pickup_time = p_pickup_time,
        passengers = p_passengers,
        luggage = p_luggage,
        trip_type = p_trip_type,
        notes = p_notes,
        has_pets = p_has_pets
    WHERE id = p_booking_id;


    /* ========================================================
       SECTION 5: UPDATE ASSIGNMENT AND BUSY PERIOD

       PERFORM calls a PostgreSQL function when we do not need
       a returned value.

       update_booking_admin_assignment() will:

       - remove the booking's previous busy period;
       - update chauffeur_id and booking status;
       - calculate the busy-period end time;
       - create a new busy period for active statuses;
       - reject overlapping chauffeur bookings.

       Because this call runs inside the current function, it is
       part of the same transaction.
    ======================================================== */
    PERFORM public.update_booking_admin_assignment(
        p_booking_id,
        p_chauffeur_id,
        p_status
    );


    /* ========================================================
       END OF FUNCTION

       RETURNS VOID means that no data object is returned.

       Successful completion means that the client, booking and
       chauffeur availability were all updated correctly.
    ======================================================== */
END;
$$;
/* ==========example trigger function=================
 -- When a chauffeur is assigned to a booking, automatically set status to assigned and update

CREATE OR REPLACE FUNCTION update_booking_status_and_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update the updated_at column
  NEW.updated_at = now();

  -- If chauffeur_id is added or changed, set status to assigned
  IF NEW.chauffeur_id IS NOT NULL
     AND NEW.chauffeur_id IS DISTINCT FROM OLD.chauffeur_id THEN
    NEW.status = 'assigned';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

Then attach it to the bookings table:

CREATE TRIGGER update_bookings_status_and_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_booking_status_and_updated_at();

*/
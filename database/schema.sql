-- Enable UUID generation . We want every database row to have a unique ID like this:
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
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

-- Vehicles used by chauffeurs
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
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
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
    available_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status availability_status NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);


-- Taxi trip booking requests
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chauffeur_id UUID REFERENCES chauffeurs(id) ON DELETE SET NULL, /*A booking can exist without a chauffeur at first.*/

  pickup_location TEXT NOT NULL,
  destination TEXT NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_time TIME NOT NULL,
  passengers INTEGER NOT NULL DEFAULT 1,
  luggage INTEGER DEFAULT 0,
  trip_type trip_type NOT NULL,
  notes TEXT,
  status booking_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);


--===================================================================
-- Indexes for faster searching
CREATE INDEX idx_bookings_client_id ON bookings(client_id); /* Find all bookings from one client */
CREATE INDEX idx_bookings_chauffeur_id ON bookings(chauffeur_id); /* Find all bookings assigned to one chauffeur */
CREATE INDEX idx_bookings_status ON bookings(status); /* Find pending/confirmed/cancelled bookings */
CREATE INDEX idx_bookings_pickup_date ON bookings(pickup_date); /* Find bookings for a date  */

CREATE INDEX idx_vehicles_chauffeur_id ON vehicles(chauffeur_id); /* Find vehicles for a chauffeur */

CREATE INDEX idx_chauffeur_availability_chauffeur_id ON chauffeur_availability(chauffeur_id); /* Find availability for a chauffeur */

CREATE INDEX idx_chauffeur_availability_date ON chauffeur_availability(available_date); /* Find chauffeurs available on a date */


--===================================================================
-- Data validation rules
ALTER TABLE bookings
ADD CONSTRAINT bookings_passengers_positive
CHECK (passengers > 0);

-- Luggage cannot be negative
ALTER TABLE bookings
ADD CONSTRAINT bookings_luggage_not_negative
CHECK (luggage >= 0);

-- Rating must be between 0 and 5
ALTER TABLE chauffeurs
ADD CONSTRAINT chauffeurs_rating_range
CHECK (rating >= 0.0 AND rating <= 5.0);

-- Vehicle must have seats
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_seats_positive
CHECK (seats > 0);

-- Vehicle luggage capacity cannot be negative
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_luggage_capacity_not_negative
CHECK (luggage_capacity >= 0);

-- Availability end time must be after start time
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_time_order
CHECK (end_time > start_time);

ALTER TABLE vehicles
ADD CONSTRAINT vehicles_year_valid
CHECK (vehicle_year IS NULL OR (vehicle_year >= 1980 AND vehicle_year <= 2100));
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

--===================================================================
/* Enable Row Level Security */
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeur_availability ENABLE ROW LEVEL SECURITY;

--===================================================================
/* create a function to get data from enumrated types */
-- you can call a function in his way: SELECT get_enum_values('booking_status');
-- in supasql:  const { data: availabilityStatuses, error } = await supabaseAdmin.rpc( "get_enum_values", { p_enum_type_name: "availability_status",});

/* Get enum values by enum type name */
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

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    chauffeur_id UUID REFERENCES chauffeurs(id) ON DELETE SET NULL,
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
/*===========================================================
=============================================================*/

/*===========================================================
=============================================================*/
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
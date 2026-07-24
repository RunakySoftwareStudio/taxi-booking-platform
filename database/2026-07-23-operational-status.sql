/* Chauffeur availability for daily operations. */
do $$
begin
    create type chauffeur_operational_status as enum (
        'available',
        'sick',
        'on_leave',
        'unavailable'
    );
exception
    when duplicate_object then null;
end $$;

/* Vehicle availability for daily operations. */
do $$
begin
    create type vehicle_operational_status as enum (
        'available',
        'damaged',
        'maintenance',
        'inactive'
    );
exception
    when duplicate_object then null;
end $$;

/* Add temporary operational availability to chauffeurs. 
    operational_status — available, sick, on leave, or unavailable.
    status_reason — optional explanation.
    status_changed_at — when the operational information was first added or later changed.
*/
alter table public.chauffeurs
    add column if not exists operational_status chauffeur_operational_status
        not null default 'available',
    add column if not exists status_reason text,
    add column if not exists status_changed_at timestamptz
        not null default now();

/* Add temporary operational availability to vehicles. 
    vehicle_status — available, damaged, maintenance, or inactive.
    status_reason — optional explanation.
    status_changed_at — when the operational status was recorded.
*/
alter table public.vehicles
    add column if not exists vehicle_status vehicle_operational_status
        not null default 'available',
    add column if not exists status_reason text,
    add column if not exists status_changed_at timestamptz
        not null default now();
/* Tracks whether an assignment alert still requires admin attention. 
    Meaning:
    open — the booking assignment still has a problem.
    resolved — the problem was corrected, but the alert remains available as history.
*/
do $$
begin
    create type assignment_alert_status as enum (
        'open',
        'resolved'
    );
exception
    when duplicate_object then null;
end $$;

/* Stores assignment problems that require administrator review. 
    Important fields:

    booking_id links the alert to its booking.
    issue_summary provides a short readable warning.
    issue_details can store multiple detailed problems as JSON.
    source_type identifies whether a vehicle, chauffeur, booking, or assignment change triggered the check.
    source_id stores the related record ID.
    resolved_at is filled when the assignment becomes valid again.
*/
create table if not exists public.assignment_alerts (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid not null
        references public.bookings(id)
        on delete cascade,

    alert_status assignment_alert_status
        not null default 'open',

    issue_summary text not null,
    issue_details jsonb not null
        default '{"issues":[]}'::jsonb,

    source_type text,
    source_id uuid,

    first_detected_at timestamptz not null default now(),
    last_checked_at timestamptz not null default now(),
    resolved_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

/* Allows only one unresolved assignment alert per booking. 
    This means:
    one booking may have only one open alert;
    repeated validation updates that existing alert instead of creating duplicates;
    the same booking may still have multiple historical resolved alerts.
*/
create unique index if not exists assignment_alerts_one_open_per_booking
on public.assignment_alerts (booking_id)
where alert_status = 'open';


/* Speeds up the admin page that lists open alerts. 
This will help queries such as:
    where alert_status = 'open'
    order by last_checked_at desc
*/
create index if not exists assignment_alerts_status_checked_index
on public.assignment_alerts (
    alert_status,
    last_checked_at desc
);

/* Keeps updated_at synchronized whenever an alert row changes. 
    Whenever an existing alert is updated—for example:
    open → resolved
    PostgreSQL automatically sets:    updated_at = now()
*/
drop trigger if exists update_assignment_alerts_updated_at
on public.assignment_alerts;

create trigger update_assignment_alerts_updated_at
before update on public.assignment_alerts
for each row
execute function public.update_updated_at_column();

/* Restricts the source that caused the assignment check. 
This prevents accidental values such as:
    vehcle
    driver
    booking-change
*/
alter table public.assignment_alerts
drop constraint if exists assignment_alerts_source_type_check;

alter table public.assignment_alerts
add constraint assignment_alerts_source_type_check
check (
    source_type is null
    or source_type in (
        'vehicle',
        'chauffeur',
        'booking',
        'assignment'
    )
);

/* Keeps resolved_at consistent with the alert status. 
    This prevents inconsistent rows such as:
    alert_status = open
    resolved_at = 2026-07-24
    or:
    alert_status = resolved
    resolved_at = null
*/
alter table public.assignment_alerts
drop constraint if exists assignment_alerts_resolved_at_check;

alter table public.assignment_alerts
add constraint assignment_alerts_resolved_at_check
check (
    (
        alert_status = 'open'
        and resolved_at is null
    )
    or
    (
        alert_status = 'resolved'
        and resolved_at is not null
    )
);

/* Prevents direct browser access to assignment alerts. 
    The Assignment Alerts page will read and update this table through:supabaseAdmin
*/
alter table public.assignment_alerts
enable row level security;

/* ============================================================
   VALIDATES ONE BOOKING ASSIGNMENT

   Returns all current chauffeur and vehicle assignment problems.

   The function will check:
   - required chauffeur and vehicle;
   - chauffeur approval and operational availability;
   - pet acceptance;
   - vehicle ownership and operational availability;
   - all vehicle capability matching rules from vehicleMatching.ts.

    - p_booking_id identifies the booking to validate.
    - booking_row, chauffeur_row, and vehicle_row will hold the related database records.
    - issues will collect every detected problem.
    - normal_seats_required will reproduce the wheelchair-seat calculation from vehicleMatching.ts.

    The function will eventually return one row containing:
    - whether the assignment is valid;
    - a short summary;
    - all detailed issues as JSON.
============================================================ */
create or replace function public.validate_booking_assignment( p_booking_id uuid)
returns table (
    is_valid boolean,
    issue_summary text,
    issue_details jsonb
)
language plpgsql
stable
set search_path = public
as $$
declare
    booking_row public.bookings%rowtype;
    chauffeur_row public.chauffeurs%rowtype;
    vehicle_row public.vehicles%rowtype;
    issues jsonb := '[]'::jsonb;
    normal_seats_required integer := 0;
begin
    
    /* Loads the booking that must be validated. select ... into booking_row stores the complete booking row in the declared variable:*/
    select *
    into booking_row
    from public.bookings
    where id = p_booking_id;

    /*if not found checks whether PostgreSQL found a booking with that ID.*/
    if not found then
        return query
        select
            false,
            'Booking not found.'::text,
            jsonb_build_object(
                'issues',
                jsonb_build_array(
                    jsonb_build_object(
                        'code', 'booking_not_found',
                        'message', 'The booking could not be found.'
                    )
                )
            );

        return;
    end if;
    
    /* Checks whether the booking has a valid chauffeur record. 
        It handles two different problems:
            chauffeur_id is null:    The booking has no chauffeur assignment.
            chauffeur_id exists, but no chauffeur row is found: The saved reference points to a missing chauffeur record.
        The issues := issues || ... expression adds a new JSON issue without deleting earlier issues.
    */
    if booking_row.chauffeur_id is null then
        issues := issues || jsonb_build_array(
            jsonb_build_object('code', 'chauffeur_missing', 'message', 'The booking has no assigned chauffeur.' )
        );
    else
        select *
        into chauffeur_row
        from public.chauffeurs
        where id = booking_row.chauffeur_id;

        if not found then
            issues := issues || jsonb_build_array(
                jsonb_build_object( 'code', 'chauffeur_not_found',  'message', 'The assigned chauffeur could not be found.' )
            );
        end if;
    end if;
    
    /* Validates the assigned chauffeur's current suitability. 
        The previous step may find no chauffeur record. In that case, we should not also test approval, availability, and pet acceptance against an empty row.
        The validator now detects:
            No chauffeur assigned
            Chauffeur record missing
            Chauffeur not approved
            Chauffeur sick, on leave, or unavailable
            Chauffeur does not accept required pets
        
        jsonb_build_object() works in key-value pairs:'key', value
        jsonb_build_object() expects an even number of arguments, because every key must have a value.
            'code', 'chauffeur_unavailable' 
            means 
            "code": "chauffeur_unavailable" 
    */
    if chauffeur_row.id is not null then
        if chauffeur_row.account_status is distinct from 'approved' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'chauffeur_not_approved',
                    'message', 'The assigned chauffeur is not approved.'
                )
            );
        end if;

        if chauffeur_row.operational_status is distinct from 'available' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'chauffeur_unavailable',
                    'message', 'The assigned chauffeur is not operationally available.',
                    'operational_status', chauffeur_row.operational_status,
                    'status_reason', chauffeur_row.status_reason
                )
            );
        end if;

        if coalesce(booking_row.has_pets, false)
           and not coalesce(chauffeur_row.accepts_pets, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'chauffeur_rejects_pets',
                    'message', 'The booking requires pet acceptance, but the assigned chauffeur does not accept pets.'
                )
            );
        end if;
    end if;
    
    /* Checks whether the booking has a valid vehicle record. 
        This distinguishes between:
            vehicle_id is null
            and:
            vehicle_id contains an ID, but the vehicle record no longer exists
    */
    if booking_row.vehicle_id is null then
        issues := issues || jsonb_build_array(
            jsonb_build_object(
                'code', 'vehicle_missing',
                'message', 'The booking has no assigned vehicle.'
            )
        );
    else
        select *
        into vehicle_row
        from public.vehicles
        where id = booking_row.vehicle_id;

        if not found then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_not_found',
                    'message', 'The assigned vehicle could not be found.'
                )
            );
        end if;
    end if;

    /* Validates the assigned vehicle's chauffeur and operational status. 
    This catches:
        a vehicle belonging to another chauffeur;
        a vehicle marked damaged, maintenance, or inactive.

        Learning:
            1. jsonb_build_object(...)
                creates one JSON object:
                {"code": "vehicle_wrong_chauffeur", "message": "The assigned vehicle does not belong to the assigned chauffeur." }
            
            2. jsonb_build_array(...)
                wraps that object inside an array:
                [ {"code": "vehicle_wrong_chauffeur", "message": "The assigned vehicle does not belong to the assigned chauffeur." }]

            2. issues := issues || new_issue_array
                means:
                existing issues + new issue
    */
    if vehicle_row.id is not null then
        if vehicle_row.chauffeur_id is distinct from booking_row.chauffeur_id then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_wrong_chauffeur',
                    'message', 'The assigned vehicle does not belong to the assigned chauffeur.'
                )
            );
        end if;

        if vehicle_row.vehicle_status is distinct from 'available' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_unavailable',
                    'message', 'The assigned vehicle is not operationally available.',
                    'operational_status', vehicle_row.vehicle_status,
                    'status_reason', vehicle_row.status_reason
                )
            );
        end if;
    end if;

    /* Matches normal passenger seats and luggage capacity. 
        The calculation deliberately matches your TypeScript rule:
            passengers - wheelchairPassengerCount
            with a minimum value of 0, because passengers who remain seated in wheelchairs do not require ordinary vehicle seats
    */
    normal_seats_required := greatest(
        0,
        coalesce(booking_row.passengers, 0)
        - coalesce(booking_row.wheelchair_passenger_count, 0)
    );

    if vehicle_row.id is not null then
        if coalesce(vehicle_row.seats, 0) < normal_seats_required then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_seats_insufficient',
                    'message', format(
                        'The booking requires %s normal passenger seats, but the vehicle has %s.',
                        normal_seats_required,
                        coalesce(vehicle_row.seats, 0)),
                    'required', normal_seats_required,
                    'available', coalesce(vehicle_row.seats, 0)
                )
            );
        end if;

        if coalesce(vehicle_row.luggage_capacity, 0)
           < coalesce(booking_row.luggage, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_luggage_insufficient',
                    'message', format(
                        'The booking requires luggage capacity for %s items, but the vehicle supports %s.',
                        coalesce(booking_row.luggage, 0),
                        coalesce(vehicle_row.luggage_capacity, 0)),
                    'required', coalesce(booking_row.luggage, 0),
                    'available', coalesce(vehicle_row.luggage_capacity, 0)
                )
            );
        end if;
    end if;

    /* Matches child-seat and ISOFIX requirements. */
    if vehicle_row.id is not null then
        if coalesce(vehicle_row.infant_seat_count, 0)
           < coalesce(booking_row.infant_seat_count_required, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_infant_seats_insufficient',
                    'message', format(
                        'The booking requires %s infant seats, but the vehicle has %s.',
                        coalesce(booking_row.infant_seat_count_required, 0),
                        coalesce(vehicle_row.infant_seat_count, 0)
                    ),
                    'required', coalesce(booking_row.infant_seat_count_required, 0),
                    'available', coalesce(vehicle_row.infant_seat_count, 0)
                )
            );
        end if;

        if coalesce(vehicle_row.child_seat_count, 0)
           < coalesce(booking_row.child_seat_count_required, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_child_seats_insufficient',
                    'message', format(
                        'The booking requires %s child seats, but the vehicle has %s.',
                        coalesce(booking_row.child_seat_count_required, 0),
                        coalesce(vehicle_row.child_seat_count, 0)
                    ),
                    'required', coalesce(booking_row.child_seat_count_required, 0),
                    'available', coalesce(vehicle_row.child_seat_count, 0)
                )
            );
        end if;

        if coalesce(vehicle_row.booster_seat_count, 0)
           < coalesce(booking_row.booster_seat_count_required, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_booster_seats_insufficient',
                    'message', format(
                        'The booking requires %s booster seats, but the vehicle has %s.',
                        coalesce(booking_row.booster_seat_count_required, 0),
                        coalesce(vehicle_row.booster_seat_count, 0)
                    ),
                    'required', coalesce(booking_row.booster_seat_count_required, 0),
                    'available', coalesce(vehicle_row.booster_seat_count, 0)
                )
            );
        end if;

        if coalesce(booking_row.isofix_required, false)
           and not coalesce(vehicle_row.isofix_available, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_isofix_missing',
                    'message', 'The booking requires ISOFIX, but the vehicle does not provide it.'
                )
            );
        end if;
    end if;

    /* Matches foldable and remain-in-wheelchair requirements. 
        This mirrors the two wheelchair branches in vehicleMatching.ts:
            foldable requires anything except none;
            remain_in_wheelchair requires ramp or lift, plus enough wheelchair capacity
    */
    if vehicle_row.id is not null then
        if booking_row.wheelchair_requirement = 'foldable'
           and vehicle_row.wheelchair_access = 'none' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_foldable_wheelchair_support_missing',
                    'message', 'The booking requires support for a foldable wheelchair.'
                )
            );
        end if;

        if booking_row.wheelchair_requirement = 'remain_in_wheelchair' then
            if vehicle_row.wheelchair_access not in ('ramp', 'lift') then
                issues := issues || jsonb_build_array(
                    jsonb_build_object(
                        'code', 'vehicle_wheelchair_access_missing',
                        'message', 'The booking requires wheelchair access by ramp or lift.'
                    )
                );
            end if;

            if coalesce(vehicle_row.wheelchair_capacity, 0)
               < coalesce(booking_row.wheelchair_passenger_count, 0) then
                issues := issues || jsonb_build_array(
                    jsonb_build_object(
                        'code', 'vehicle_wheelchair_capacity_insufficient',
                        'message', format(
                            'The booking requires capacity for %s wheelchair passengers, but the vehicle supports %s.',
                            coalesce(booking_row.wheelchair_passenger_count, 0),
                            coalesce(vehicle_row.wheelchair_capacity, 0)
                        ),
                        'required', coalesce(booking_row.wheelchair_passenger_count, 0),
                        'available', coalesce(vehicle_row.wheelchair_capacity, 0)
                    )
                );
            end if;
        end if;
    end if;
    /* Matches mobility-aid storage and extra-large luggage requirements. */
    if vehicle_row.id is not null then
        if coalesce(booking_row.mobility_aid_storage_required, false)
           and not coalesce(vehicle_row.mobility_aid_storage, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_mobility_storage_missing',
                    'message', 'The booking requires mobility-aid storage, but the vehicle does not provide it.'
                )
            );
        end if;

        if coalesce(booking_row.extra_large_luggage_required, false)
           and not coalesce(vehicle_row.extra_large_luggage, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_extra_large_luggage_missing',
                    'message', 'The booking requires support for extra-large luggage, but the vehicle does not provide it.'
                )
            );
        end if;
    end if;

  /* Returns valid only when no assignment problems were found. */
    return query
    select
        jsonb_array_length(issues) = 0,
        case
            when jsonb_array_length(issues) = 0 then null::text
            else issues -> 0 ->> 'message'
        end,
        jsonb_build_object('issues', issues);
end;
$$;

/* ============================================================
   SYNCHRONIZES ONE BOOKING'S ASSIGNMENT ALERT

   - invalid assignment: creates or updates one open alert;
   - valid assignment: resolves the existing open alert;
   - resolved alerts remain stored as history.
============================================================ */
create or replace function public.sync_booking_assignment_alert(
    p_booking_id uuid,
    p_source_type text default 'assignment',
    p_source_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
    validation_row record;
begin
    select *
    into validation_row
    from public.validate_booking_assignment(p_booking_id);

     /* Creates or refreshes the open alert when the assignment is invalid. 
        If an open alert already exists, it is updated with the latest problems.
        If no open alert exists, a new row is inserted.
        The partial unique index still guarantees: one open alert per booking
     */
    if not validation_row.is_valid then
        update public.assignment_alerts
        set
            issue_summary = validation_row.issue_summary,
            issue_details = validation_row.issue_details,
            source_type = p_source_type,
            source_id = p_source_id,
            last_checked_at = now(),
            resolved_at = null
        where booking_id = p_booking_id
        and alert_status = 'open';

        if not found then
            insert into public.assignment_alerts (
                booking_id,
                alert_status,
                issue_summary,
                issue_details,
                source_type,
                source_id,
                first_detected_at,
                last_checked_at
            )
            values (
                p_booking_id,
                'open',
                validation_row.issue_summary,
                validation_row.issue_details,
                p_source_type,
                p_source_id,
                now(),
                now()
            );
        end if;

        return;
    end if;

    /* Resolves the current open alert when the assignment is valid again. */
    update public.assignment_alerts
    set
        alert_status = 'resolved',
        source_type = p_source_type,
        source_id = p_source_id,
        last_checked_at = now(),
        resolved_at = now()
    where booking_id = p_booking_id
    and alert_status = 'open';
end;
$$;

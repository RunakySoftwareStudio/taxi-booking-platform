/*
================================================================
VOYA TAXI - JOURNEY QUOTE DESTINATION COUNTRY

Purpose:

Store the destination country on a journey quote.

The existing country_code continues to represent the
pricing country selected from the pickup location.

Examples:

    NL → NL
    country_code = NL
    destination_country_code = NL

    NL → BE
    country_code = NL
    destination_country_code = BE

This gives the system enough information to recognize
domestic and international journeys.

Tax treatment for international journeys will be handled
later in Pricing Process 4.
================================================================
*/

ALTER TABLE public.journey_quotes
ADD COLUMN IF NOT EXISTS destination_country_code TEXT;


/*
    Older quotes do not contain destination-country information,
    so this column remains nullable for historical compatibility.

    New quotes created by the application will provide it.
*/
COMMENT ON COLUMN public.journey_quotes.destination_country_code IS
'Destination country code derived server-side from the destination coordinate. NULL is allowed for older quotes.';
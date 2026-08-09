import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/*
    Purpose:
    Checks that a value is a valid UUID before sending it to PostgreSQL.
    Both quoteId and bookingSessionId are UUID values.
*/
function isValidUuid(inputValue: unknown): inputValue is string {
    return (
        typeof inputValue === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inputValue)
    );
}


/*
    Purpose:
    Voids one temporary journey quote when the customer abandons an unfinished booking.
    The browser must provide:
    - quoteId;
    - bookingSessionId.

    PostgreSQL verifies that both belong together before the quote may be voided.
*/
export async function POST(request: Request) {

    let requestBody: unknown;

    try {
        requestBody = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid request body." },
            { status: 400 }
        );
    }


    // The JSON body must be an object.
    if (typeof requestBody !== "object" || requestBody === null) {
        return NextResponse.json(
            { error: "Invalid request body." },
            { status: 400 }
        );
    }

    const requestData = requestBody as Record<string, unknown>;

    // Both identifiers must be valid UUID values.
    if (
        !isValidUuid(requestData.quoteId) ||
        !isValidUuid(requestData.bookingSessionId)
    ) {
        return NextResponse.json(
            { error: "Invalid journey quote identifiers." },
            { status: 400 }
        );
    }


    /*
        Call the protected PostgreSQL function.
        Only supabaseAdmin/service_role has permission to execute this function.
    */
    const { data: quoteWasVoided, error: voidQuoteError } = await supabaseAdmin
        .rpc("void_abandoned_journey_quote", {
            p_quote_id: requestData.quoteId,
            p_booking_session_id: requestData.bookingSessionId,
        });


    if (voidQuoteError) {
        console.error("Could not void abandoned journey quote:", voidQuoteError);

        return NextResponse.json(
            { error: "The temporary journey quote could not be voided." },
            { status: 409 }
        );
    }


    /*
        quoteWasVoided:
        true  = active quote was changed to voided.
        false = quote was already voided.
    */
    return NextResponse.json(
        { voided: quoteWasVoided },
        { status: 200 }
    );
}
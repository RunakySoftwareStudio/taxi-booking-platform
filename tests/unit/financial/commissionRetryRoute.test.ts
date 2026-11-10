
/* ============================================================
   VOYA TAXI — ADMIN COMMISSION RETRY API TESTS

   Verify successful retries, unresolved financial failures,
   and missing review records without accessing Supabase.
============================================================ */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* SECTION 1: Mock Next.js and Supabase dependencies. */
const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    adminFrom: vi.fn(),
    adminRpc: vi.fn(),
    revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({
    NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabaseServer", () => ({
    supabaseAdmin: { from: mocks.adminFrom, rpc: mocks.adminRpc },
}));

import { POST } from "@/app/api/admin/commissions/[bookingId]/retry/route";

const bookingId = "11111111-1111-4111-8111-111111111111";
const commissionId = "22222222-2222-4222-8222-222222222222";

/* SECTION 2: Simulate Supabase's chained query interface. */
function mockQuery(data: unknown, error: unknown = null) {
    const query = {
        select: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    return query;
}

/* SECTION 3: Prepare an authenticated Admin and simulated database. */
function setupTest(options: { failure?: boolean; commission?: boolean; unresolved?: boolean } = {}) {
    const { failure = true, commission = true, unresolved = false } = options;
    let failureReads = 0;

    mocks.createClient.mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-test" } }, error: null }) },
        from: vi.fn().mockReturnValue(mockQuery({ role: "admin" })),
    });

    mocks.adminFrom.mockImplementation((table: string) => {
        if (table === "chauffeur_commission_generation_failures") {
            failureReads++;
            return mockQuery(failureReads === 1
                ? (failure ? { id: "failure-test" } : null)
                : (unresolved ? { error_message: "Missing service-fee rate." } : null));
        }
        if (table === "bookings") return mockQuery({ status: "completed", is_financially_excluded: false });
        if (table === "chauffeur_booking_commissions") return mockQuery(commission ? { id: commissionId } : null);
        throw new Error(`Unexpected table: ${table}`);
    });

    mocks.adminRpc.mockResolvedValue({ error: null });
}

/* SECTION 4: Execute the actual API handler with mocked dependencies. */
async function sendRetry() {
    const request = new Request(`http://localhost/api/admin/commissions/${bookingId}/retry`, { method: "POST" });
    return POST(request, { params: Promise.resolve({ bookingId }) });
}

describe("Admin commission retry API", () => {
    beforeEach(() => vi.clearAllMocks());

    /* TEST 1: Successful retry generates a frozen commission. */
    it("returns success when commission generation succeeds", async () => {
        setupTest();
        const response = await sendRetry();
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        expect(result.commissionId).toBe(commissionId);
        expect(mocks.adminRpc).toHaveBeenCalledWith("process_completed_booking_commission", { p_booking_id: bookingId });
        expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/financial-settings/commissions");
    });

    /* TEST 2: An unresolved failure must not be reported as success. */
    it("returns 409 when commission generation remains unresolved", async () => {
        setupTest({ commission: false, unresolved: true });
        const response = await sendRetry();
        const result = await response.json();

        expect(response.status).toBe(409);
        expect(result.message).toBe("Missing service-fee rate.");
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    /* TEST 3: Retry is blocked without an unresolved failure. */
    it("returns 404 when no unresolved financial failure exists", async () => {
        setupTest({ failure: false });
        const response = await sendRetry();
        const result = await response.json();

        expect(response.status).toBe(404);
        expect(result.message).toBe("No unresolved commission failure found.");
        expect(mocks.adminRpc).not.toHaveBeenCalled();
    });
});

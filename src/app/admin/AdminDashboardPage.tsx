import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import LogoutButton from "@/components/LogoutButton";
import { supabaseAdmin } from "@/lib/supabaseServer";

/*
    DashboardCard describes one clickable card on the admin dashboard.

    Each card has:
    - title: text shown on the card
    - description: short explanation
    - href: link to the admin management page
*/
type DashboardCard = {
    title: string;
    description: string;
    href: string;
};

/*
    getTableCount counts all rows in a Supabase table.

    Example:
    getTableCount("bookings")
    returns the number of rows in the bookings table.
*/
async function getTableCount(tableName: string) {
    const { count, error } = await supabaseAdmin
        .from(tableName)
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error(`Could not count ${tableName}:`, error);
        return 0;
    }

    return count || 0;
}

/*
    getPendingBookingsCount counts only bookings with status "pending".

    This tells the admin how many booking requests still need action.
*/
async function getPendingBookingsCount() {
    const { count, error } = await supabaseAdmin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

    if (error) {
        console.error("Could not count pending bookings:", error);
        return 0;
    }

    return count || 0;
}

/*
    getApprovedChauffeursCount counts only chauffeurs with account_status "approved".
    In our database, approved chauffeurs are the chauffeurs who can be used by the platform.
*/
async function getApprovedChauffeursCount() {
    const { count, error } = await supabaseAdmin
        .from("chauffeurs")
        .select("*", { count: "exact", head: true })
        .eq("account_status", "approved");

    if (error) {
        console.warn("Could not count approved chauffeurs:", error);
        return 0;
    }

    return count || 0;
}

/*
    AdminDashboardPage is the main admin dashboard component.

    It is an async server component, so it can read Supabase data
    before the page is shown.
*/
export default async function AdminDashboardPage() {
    /*
        Promise.all runs all count requests at the same time.

        This is faster than waiting for each count one by one.
    */
    const [
        totalBookings,
        pendingBookings,
        totalClients,
        totalChauffeurs,
        approvedChauffeurs,
        totalVehicles,
    ] = await Promise.all([
        getTableCount("bookings"),
        getPendingBookingsCount(),
        getTableCount("clients"),
        getTableCount("chauffeurs"),
        getApprovedChauffeursCount(),
        getTableCount("vehicles"),
    ]);

    /*
        dashboardCards is the list of cards shown on the dashboard.

        We add the total number directly inside the card title.
        This avoids having two repeated sections.
    */
    const dashboardCards: DashboardCard[] = [
        {
            title: `Bookings (${totalBookings})`,
            description: `Pending bookings: ${pendingBookings}`,
            href: "/admin/bookings",
        },
        {
            title: `Chauffeurs (${totalChauffeurs})`,
            description: `Active chauffeurs: ${approvedChauffeurs}`,
            href: "/admin/chauffeurs",
        },
        {
            title: `Clients (${totalClients})`,
            description: "View clients and their booking history.",
            href: "/admin/clients",
        },
        {
            title: `Vehicles (${totalVehicles})`,
            description: "Manage vehicles connected to chauffeurs.",
            href: "/admin/vehicles",
        },
        {
            title: "Chauffeur availability",
            description: "View when chauffeurs are available, busy, offline, or on holiday.",
            href: "/admin/availability",
        },
    ];

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {/* Link back to the public homepage */}
                <Link href="./" className={formStyles.link}>
                    ← Back to home page
                </Link>

                {/* Page header with title and logout button */}
                <div className={formStyles.formDivFlex}>
                    <div>
                        <p className={pageStyles.pageLabelUpper}>Admin</p>
                        <h1 className={pageStyles.pageTitle}>Admin dashboard</h1>
                    </div>
                    <LogoutButton />
                </div>
                <p className={pageStyles.pageDescription}> Manage bookings, chauffeurs, clients, and platform settings.  </p>

                {/* Main dashboard cards */}
                <section className="mt-10">
                    <h2 className={pageStyles.pageLabel}>Management overview</h2>
                    <div className="mt-4 grid gap-6 md:grid-cols-3">
                        {dashboardCards.map((cardItem) => (
                            <Link key={cardItem.title} href={cardItem.href}  className={pageStyles.sectionCardCyan}  >
                                <h2 className={pageStyles.pageLabel}> {cardItem.title}   </h2>
                                <p className={pageStyles.pageDescription}> {cardItem.description}  </p>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
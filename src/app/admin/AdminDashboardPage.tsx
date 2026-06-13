import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import LogoutButton from "@/components/LogoutButton";

export default function AdminDashboardPage() {
  return (
      <main className={pageStyles.main}>
        <div className={pageStyles.container}> 
          <Link  href="./" className={formStyles.link} > ← Back to home page </Link>
          <div className={formStyles.formDivFlex}>
                <div>
                    <p className={pageStyles.pageLabelUpper}>Admin</p>
                    <h1 className={pageStyles.pageTitle}>Admin dashboard</h1>
                </div>
                <LogoutButton />
            </div>
          
          <p className={pageStyles.pageDescription}> Manage bookings, chauffeurs, clients, and platform settings. </p>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
                <Link href="/admin/bookings" className={pageStyles.sectionCardCyan} >
                    <h2 className={pageStyles.pageLabel}>Bookings</h2>
                    <p className={pageStyles.pageDescription}> View booking requests and update their status. </p>
                </Link>

                <Link href="/admin/chauffeurs" className={pageStyles.sectionCardCyan} >
                    <h2 className={pageStyles.pageLabel}>Chauffeurs</h2>
                    <p className={pageStyles.pageDescription}> Manage chauffeur profiles and approvals. </p>
                </Link>

                <Link href="/admin/clients" className={pageStyles.sectionCardCyan} >
                    <h2 className={pageStyles.pageLabel}>Clients</h2>
                    <p className={pageStyles.pageDescription}>  View clients and their booking history. </p>
                </Link>
                <Link href="/admin/vehicles" className={pageStyles.sectionCardCyan} >
                    <h2 className={pageStyles.pageLabel}>Vehicles</h2>
                    <p className={pageStyles.pageDescription}> Add vehicles and connect them to approved chauffeurs. </p>
                </Link>
                <Link href="/admin/availability" className={pageStyles.sectionCardCyan}>
                    <h2 className={pageStyles.pageLabel}>  Chauffeur availability </h2>
                    <p className={pageStyles.pageDescription}> View when chauffeurs are available, busy, offline, or on holiday. </p>
                </Link>
            </div>
        </div>
    </main>
  );
}
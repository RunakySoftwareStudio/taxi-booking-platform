
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles,mobileStyle } from "@/styles/classNames";
import { formatShortDateTime } from "@/lib/formatDateTime";

//export const dynamic = "force-dynamic";  //Keep dynamic only in: src/app/admin/clients/page.tsx 

type ClientRow = 
    {
        id: string;
        name: string;
        email: string;
        phone: string;
        created_at: string;
    };

export default async function AdminClientsPage() 
{
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, phone, created_at")
    .order("created_at", { ascending: false });


  if (error) 
    {
        console.error("Could not load clients:", error);
        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <h1 className={pageStyles.pageTitle}> Admin clients</h1>
                    <p className={pageStyles.errorMsg}> Could not load clients. </p>
                </div>
            </main>
        );
    }

  const clientRows = (clients ?? []) as ClientRow[];

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.container}> 
        <Link  href="/admin" className={formStyles.link}  > ← Back to admin dashboard </Link>
        <p className={pageStyles.pageLabelUpper}> Admin </p>
        <h1 className={pageStyles.pageTitle}>Clients</h1>
        <p className={pageStyles.pageDescription}>  View clients who submitted booking requests through the website.  </p>
        {/* Mobile client cards */}
        <div className="mt-6 grid gap-4 lg:hidden">
            {clientRows.map((client) => (
            <article key={client.id} className="rounded-2xl border-2 border-cyan-400/30 bg-cyan-950/20 p-4 text-sm text-white" >
                <div>
                  <span className={mobileStyle.inforCaption}> Name: </span>
                  <span className={mobileStyle.infoValue}>{client.name}</span>
                </div>
                <div >
                  <span className={mobileStyle.inforCaption}> Email: </span>
                  <span className={mobileStyle.infoValue}>{client.email}</span>
                </div>
                <div >
                    <span className={mobileStyle.inforCaption}> Phone: </span>
                    <span className={mobileStyle.infoValue}>{client.phone}</span>
                </div>
                <div >
                  <span className={mobileStyle.inforCaption}> Created at:  </span>
                  <span className={mobileStyle.infoValue}>  {formatShortDateTime(client.created_at)}</span> 
                </div>
                <div className="mt-5">
                  <Link  href={`/admin/clients/${client.id}`} className={formStyles.smallButton} >
                    Open client details
                  </Link>
                </div>
            </article> ))}

            {clientRows.length === 0 && ( <div className={tableStyles.cellEmpty}> No clients found yet. </div> )}
          </div>

        {/* Desktop clients table */}
        <div className={`${tableStyles.DivCyanList} hidden lg:block`}>
          <table className={tableStyles.table1000}>
            <thead className={tableStyles.tableHeaderCyan}>
              <tr>
                <th className={tableStyles.cellCaption}>Name</th>
                <th className={tableStyles.cellCaption}>Email</th>
                <th className={tableStyles.cellCaption}>Phone</th>
                <th className={tableStyles.cellCaption}>Created at</th>
                <th className={tableStyles.cellCaption}>Details</th>
              </tr>
            </thead>

            <tbody>
              {clientRows.map((client) => (
                <tr key={client.id} className={tableStyles.rowCyan}>
                  <td className={tableStyles.cell}>{client.name}</td>
                  <td className={tableStyles.cell}>{client.email}</td>
                  <td className={tableStyles.cell}>{client.phone}</td>
                  <td className={tableStyles.cell}>
                    {new Date(client.created_at).toLocaleString()}
                  </td>
                  <td className={tableStyles.cellCaption}>
                    <Link href={`/admin/clients/${client.id}`} className={formStyles.smallButton} >
                      Open client details
                    </Link>
                  </td>
                </tr>
              ))}

              {clientRows.length === 0 && (<tr><td className={tableStyles.cell} colSpan={5}>  No clients found yet. </td></tr> )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
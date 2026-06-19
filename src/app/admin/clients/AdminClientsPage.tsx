
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

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
        <div className={tableStyles.DivCyanList}>
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
                        <td className={tableStyles.cell}> {client.email}</td>
                        <td className={tableStyles.cell}> {client.phone}</td>
                        <td className={tableStyles.cell}> {new Date(client.created_at).toLocaleString()}  </td>
                        <td className={tableStyles.cellCaption}>
                            <Link href={`/admin/clients/${client.id}`} className={formStyles.smallButton} >
                                Open client details
                            </Link>
                        </td>
                    </tr>
                ))}

              {clientRows.length === 0 && (<tr> <td className={tableStyles.cell} colSpan={5}>  No clients found yet. </td> </tr> )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
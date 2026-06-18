/*-=========================================================
  StatusPage keeps the route src/app working
  src/app/status/StatusPage.tsx contains the real page code
=============================================================*/
import StatusPage from "./StatusPage";

type PageProps = { searchParams: Promise<{ bookingId?: string; }>;};

export default async function Page({ searchParams }: PageProps) {
  const pageSearchParams = await searchParams;
  return <StatusPage initialBookingId={pageSearchParams.bookingId ?? ""} />;
}


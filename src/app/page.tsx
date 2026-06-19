/*-=========================================================
  page.tsx keeps the route ./ working
  src/app/HomePage.tsx contains the real page code
=============================================================*/
export const dynamic = "force-dynamic"; //Do not statically cache this homepage. Load fresh data when the page is requested.
import HomePage from "./HomePage";

export default function Page() {
  return <HomePage />;
}
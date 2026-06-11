/*-=========================================================
  page.tsx keeps the route /admin/clients working
  AdminClientsPage.tsx contains the real page code
=============================================================*/

export const dynamic = "force-dynamic"; // Next.js says force-dynamic forces dynamic rendering, meaning the route is rendered for each user at request time.

export { default } from "./AdminClientsPage";
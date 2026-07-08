/*
  MaintenancePage is shown when the website is temporarily closed.

  We use this for safe maintenance mode:
    MAINTENANCE_MODE=true  → show this page
    MAINTENANCE_MODE=false → show the normal website

  This lets us make the public website unavailable without deleting
  the Vercel project or stopping local development.
*/

import { maintenancePageStyles } from "@/styles/classNames";

export default function MaintenancePage() 
{
  return (
    <main className={maintenancePageStyles.page}>
      <section className={maintenancePageStyles.card}>
        <p className={maintenancePageStyles.label}> VOYΛ TAXI </p>
        <h1 className={maintenancePageStyles.title}> Website temporarily unavailable </h1>
        <p className={maintenancePageStyles.description}> We are currently working on improvements. Please come back later. </p>
        <p className={maintenancePageStyles.description}> Wij werken momenteel aan verbeteringen. Kom later terug. </p>
        <p className={maintenancePageStyles.note}> Thank you for your patience. </p>
        <p className={maintenancePageStyles.brand}> Where the journey begins </p>
      </section>
    </main>
  );
}
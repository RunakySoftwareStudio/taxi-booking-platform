import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import LogoutButton from "@/components/LogoutButton";

export default function UnauthorizedPage() {
  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containersmall}>
        <p className={pageStyles.pageLabel}>Access denied</p>
        <h1 className={pageStyles.pageTitle}>You do not have permission</h1>
        <p className={pageStyles.pageDescription}> Your account is logged in, but it does not have permission to open this page. </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/" className={formStyles.smallButton}> Go to homepage </Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
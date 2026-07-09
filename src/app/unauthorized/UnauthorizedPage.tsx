/*
  UnauthorizedPage is shown when a logged-in user tries to open
  a page they do not have permission to access.

  In Version 5, the visible text uses TranslatedText so it can switch
  between English and Dutch.
*/

import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import LogoutButton from "@/components/LogoutButton";
import { TranslatedText } from "@/components/TranslatedText";

export default function UnauthorizedPage() {
  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containersmall}>
        <p className={pageStyles.pageLabel}> <TranslatedText sectionName="unauthorizedPage" textKey="label" /> </p>
        <h1 className={pageStyles.pageTitle}> <TranslatedText sectionName="unauthorizedPage" textKey="title" /> </h1>
        <p className={pageStyles.pageDescription}> <TranslatedText sectionName="unauthorizedPage" textKey="description" /> </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/" className={formStyles.smallButton}> <TranslatedText sectionName="unauthorizedPage" textKey="homepageButton" /> </Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
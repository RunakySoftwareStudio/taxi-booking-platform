/*
  ChauffeurRegisterPage creates the public route:
  /chauffeur-register

  This page controls:
    - the top menu
    - the page layout
    - the page title and introduction
    - the chauffeur registration form

  In Version 5, the visible page heading text uses TranslatedText
  so it can switch between English and Dutch.
*/

import TopMenu from "@/components/TopMenu";
import ChauffeurRegistrationForm from "@/components/ChauffeurRegistrationForm";
import { TranslatedText } from "@/components/TranslatedText";

export default function ChauffeurRegisterPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 pb-16 pt-32 text-white">
      <TopMenu />

      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> <TranslatedText sectionName="chauffeurRegisterPage" textKey="brand" /> </p>
          <h1 className="mt-4 text-3xl font-bold md:text-5xl"> <TranslatedText sectionName="chauffeurRegisterPage" textKey="title" /> </h1>
          <p className="mt-4 text-slate-300"> <TranslatedText sectionName="chauffeurRegisterPage" textKey="description" /> </p>
        </div>

        <ChauffeurRegistrationForm />
      </div>
    </main>
  );
}
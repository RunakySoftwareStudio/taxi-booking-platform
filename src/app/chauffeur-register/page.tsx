import TopMenu from "@/components/TopMenu";
import ChauffeurRegistrationForm from "@/components/ChauffeurRegistrationForm";

/**
 * ChauffeurRegisterPage
 *
 * This page creates the public route:
 * /chauffeur-register
 *
 * The page itself controls the page layout, header, title,
 * introduction text, and then loads the registration form component.
 */
export default function ChauffeurRegisterPage() {
  /**
   * Final page layout section
   *
   * TopMenu gives the user access back to the main website navigation.
   * Because TopMenu is fixed at the top of the screen, we use pt-32
   * to create enough space below the header.
   */
  return (
    <main className="min-h-screen bg-slate-950 px-6 pb-16 pt-32 text-white">
      <TopMenu />

      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">  VOYΛ TAXI  </p>
          <h1 className="mt-4 text-3xl font-bold md:text-5xl">  Register as chauffeur </h1>
          <p className="mt-4 text-slate-300"> Join Voya Taxi and send your chauffeur registration request for admin approval. </p>
        </div>

        <ChauffeurRegistrationForm />
      </div>
    </main>
  );
}
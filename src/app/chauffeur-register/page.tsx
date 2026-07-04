import ChauffeurRegistrationForm from "@/components/ChauffeurRegistrationForm";

/**
 * ChauffeurRegisterPage
 *
 * This page creates the public route:
 * /chauffeur-register
 *
 * The page itself only controls the page layout, title, and introduction text.
 * The real form logic is inside ChauffeurRegistrationForm.
 */
export default function ChauffeurRegisterPage() {
  /**
   * Final page layout section
   *
   * This return shows the full public chauffeur registration page.
   * It uses a dark background, centered content, branding text,
   * and then renders the form component.
   */
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
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
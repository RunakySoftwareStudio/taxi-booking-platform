"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    setIsLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password});

    if (error) {
      setErrorMessage("Login failed. Please check your email and password.");
      setIsLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containersmall}>
        <Link href="/" className={formStyles.link}>  ← Back to homepage  </Link>
        <p className={`mt-8 ${formStyles.formCaptionUpTracking03}`} >  Login </p>
        <h1 className={pageStyles.pageTitle}>Sign in</h1>
        <p className={pageStyles.pageDescription}> Sign in to manage bookings, chauffeurs, clients, and vehicles. </p>

        <form onSubmit={handleLogin}  className={formStyles.formMt10} >
          <div className="grid gap-6">
                <label className="block">
                    <span className={formStyles.span}>Email address</span>
                    <input name="email"  type="email"  required  placeholder="admin@example.com" className={formStyles.input} />
                </label>
                <label className="block">
                    <span className={formStyles.span}>Password</span>
                    <input name="password"  type="password"  required placeholder="Your password" className={formStyles.input}/>
                </label>
          </div>
          <button
            type="submit"  disabled={isLoading}  className={`mt-6 ${formStyles.primaryButtonDP}`} >  {isLoading ? "Signing in..." : "Sign in"}
          </button>
          {errorMessage && ( <p className={tableStyles.errorCell}>  {errorMessage}  </p>  )}
        </form>
      </div>
    </main>
  );
}
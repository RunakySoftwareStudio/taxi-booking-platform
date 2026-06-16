"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

type ChauffeurForEdit = {
  id: string;
  name: string;
  email: string;
  phone: string;
  service_area: string | null;
  account_status: string;
};

type AdminChauffeurEditFormProps = {
  chauffeur: ChauffeurForEdit;
  accountStatusOptions: string[];
};

export default function AdminChauffeurEditForm({ chauffeur, accountStatusOptions}: AdminChauffeurEditFormProps) 
{
  const router = useRouter();
  const [name, setName] = useState(chauffeur.name);
  const [email, setEmail] = useState(chauffeur.email);
  const [phone, setPhone] = useState(chauffeur.phone);
  const [serviceArea, setServiceArea] = useState(chauffeur.service_area ?? "");
  const [accountStatus, setAccountStatus] = useState(chauffeur.account_status);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSuccessMessage("");
    setErrorMessage("");
    setIsSaving(true);

    try {
        const response = await fetch(`/api/admin/chauffeurs/${chauffeur.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name,  email, phone, serviceArea,  accountStatus }),
        });

        const result = await response.json();
        if (!response.ok) { setErrorMessage(result.message || "Could not update chauffeur."); return; }

        setSuccessMessage("Chauffeur details updated successfully.");
        router.refresh();
    } 
    catch (error) {
        console.error("Could not update chauffeur:", error);
        setErrorMessage("Could not update chauffeur. Please try again.");
    } 
    finally { setIsSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className={`${formStyles.sectionCard} mt-8`}>
      {successMessage && (<p className={pageStyles.successMsgPage}>{successMessage}</p> )}
      {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}

      <div className="grid gap-5 md:grid-cols-2">
        <label className={formStyles.label}> Name
          <input value={name} onChange={(event) => setName(event.target.value)} required className={formStyles.inputWFull} />
        </label>

        <label className={formStyles.label}>  Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={formStyles.inputWFull} />
        </label>

        <label className={formStyles.label}> Phone
          <input value={phone}  onChange={(event) => setPhone(event.target.value)} required  className={formStyles.inputWFull}/>
        </label>

        <label className={formStyles.label}>  Service area
          <input  value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder="Example: Amsterdam" className={formStyles.inputWFull} />
        </label>

        <label className={formStyles.label}>  Account status
          <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} required className={formStyles.selectWFull} >
            {accountStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option>  ))}
          </select>
        </label>
      </div>

      <button type="submit" disabled={isSaving}  className={`${formStyles.primaryButtonOutside} mt-6`} >
        {isSaving ? "Saving..." : "Save chauffeur details"}
      </button>
    </form>
  );
}
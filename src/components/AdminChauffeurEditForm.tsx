"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";

type ChauffeurForEdit = {
  id: string;
  name: string;
  email: string;
  phone: string;
  service_area: string | null;
  account_status: string;
  accepts_pets: boolean;
  operational_status: string;
  status_reason: string | null;
  status_changed_at: string;
};

type AdminChauffeurEditFormProps = {
  chauffeur: ChauffeurForEdit;
  accountStatusOptions: string[];
};

export default function AdminChauffeurEditForm({ chauffeur, accountStatusOptions}: AdminChauffeurEditFormProps)
{
  const router = useRouter();
  const { languageCode } = useLanguage();

  // getAdminChauffeurEditText returns translated text for this edit form.
  function getAdminChauffeurEditText(textKey: string) { return getTranslation("adminChauffeurEditPage", textKey, languageCode); }

  // getAccountStatusLabel converts database status values into readable text.
  function getAccountStatusLabel(accountStatusValue: string) {
    if (accountStatusValue === "pending_approval") { return getAdminChauffeurEditText("statusPendingApproval"); }
    if (accountStatusValue === "approved") { return getAdminChauffeurEditText("statusApproved"); }
    if (accountStatusValue === "inactive") { return getAdminChauffeurEditText("statusInactive"); }
    if (accountStatusValue === "suspended") { return getAdminChauffeurEditText("statusSuspended"); }

    return accountStatusValue;
  }

  const [name, setName] = useState(chauffeur.name);
  const [email, setEmail] = useState(chauffeur.email);
  const [phone, setPhone] = useState(chauffeur.phone);
  const [serviceArea, setServiceArea] = useState(chauffeur.service_area ?? "");
  const [accountStatus, setAccountStatus] = useState(chauffeur.account_status);
  const [acceptsPets, setAcceptsPets] = useState(chauffeur.accepts_pets);
  const [operationalStatus, setOperationalStatus] = useState(chauffeur.operational_status);
  const [statusReason, setStatusReason] = useState(chauffeur.status_reason ?? "");

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
            body: JSON.stringify({ name, email, phone, serviceArea, accountStatus, acceptsPets, operationalStatus, statusReason}),
        });

        const result = await response.json();
        if (!response.ok) { setErrorMessage(result.message || getAdminChauffeurEditText("updateFailedError")); return; }

        setSuccessMessage(getAdminChauffeurEditText("updateSuccess"));
        router.refresh();
    }
    catch (error) {
        console.error("Could not update chauffeur:", error);
        setErrorMessage(getAdminChauffeurEditText("updateFailedError"));
    }
    finally { setIsSaving(false); }
  }

  return (
    <main>
        <div >
            {successMessage && (<p className={pageStyles.successMsgPage}>{successMessage}</p> )}
            {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}
        </div>
        <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-8`}>
          <div className="grid gap-5 md:grid-cols-2">

            <label className={formStyles.label}> {getAdminChauffeurEditText("nameLabel")}
              <input value={name} onChange={(event) => setName(event.target.value)} required className={formStyles.inputWFullCyan} />
            </label>

            <label className={formStyles.label}> {getAdminChauffeurEditText("emailLabel")}
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={formStyles.inputWFullCyan} />
            </label>

            <label className={formStyles.label}> {getAdminChauffeurEditText("phoneLabel")}
              <input value={phone}  onChange={(event) => setPhone(event.target.value)} required  className={formStyles.inputWFullCyan}/>
            </label>

            <label className={formStyles.label}> {getAdminChauffeurEditText("serviceAreaLabel")}
              <input  value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder={getAdminChauffeurEditText("serviceAreaPlaceholder")} className={formStyles.inputWFullCyan} />
            </label>

            <label className={formStyles.label}> {getAdminChauffeurEditText("accountStatusLabel")}
              <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} required className={formStyles.selectWFull} >
                {accountStatusOptions.map((status) => ( <option key={status} value={status}> {getAccountStatusLabel(status)} </option>))}
              </select>
            </label>

            <label className={formStyles.label}>Operational status
              <select
                  value={operationalStatus} required className={formStyles.selectWFull}
                  onChange={(event) =>  { const newStatus = event.target.value; setOperationalStatus(event.target.value); if (newStatus === "available") {setStatusReason(""); }}} >
                <option value="available">Available</option>
                <option value="sick">Sick</option>
                <option value="on_leave">On leave</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className={formStyles.span}>Operational status reason</span>
                <textarea className={formStyles.textarea}
                  value={statusReason} onChange={(event) => setStatusReason(event.target.value)}
                  placeholder="For example: illness or temporary unavailability"
                />
            </label>
            <label className="flex items-center gap-3 text-sm text-white">
              <input type="checkbox" checked={acceptsPets} onChange={(event) => setAcceptsPets(event.target.checked)}  className="h-5 w-5"/>
                {getAdminChauffeurEditText("acceptsPetsLabel")}
            </label>
          </div>

          <button type="submit" disabled={isSaving}  className={`${formStyles.primaryButtonOutside} mt-6`} >
            {isSaving ? getAdminChauffeurEditText("savingButton") : getAdminChauffeurEditText("saveButton")}
          </button>
        </form>
    </main>
  );
}
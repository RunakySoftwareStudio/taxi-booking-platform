"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

/* ============================================================
   ADMIN CHAUFFEUR CREATE FORM
   Creates a new chauffeur, then opens the normal chauffeur
   detail page where compliance becomes available.
============================================================ */

type TaxiOperatorOption = {
    id: string;
    company_name: string;
    verification_status: string;
};

type AdminChauffeurCreateFormProps = {
    accountStatusOptions: string[];
    taxiOperatorOptions: TaxiOperatorOption[];
};

export default function AdminChauffeurCreateForm({ accountStatusOptions, taxiOperatorOptions }: AdminChauffeurCreateFormProps) {
    const router = useRouter();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [operatorId, setOperatorId] = useState("");
    const [serviceArea, setServiceArea] = useState("");
    const [accountStatus, setAccountStatus] = useState("pending_approval");
    const [operationalStatus, setOperationalStatus] = useState("available");
    const [statusReason, setStatusReason] = useState("");
    const [acceptsPets, setAcceptsPets] = useState(false);

    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    /* Creates the chauffeur and redirects to the new chauffeur detail page. */
    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage("");
        setIsSaving(true);

        try {
            const response = await fetch("/api/admin/chauffeurs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, phone, operatorId, serviceArea, accountStatus, operationalStatus, statusReason, acceptsPets }),
            });

            const result = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message || "Could not create chauffeur.");
                return;
            }

            router.push(`/admin/chauffeurs/${result.chauffeurId}`);
            router.refresh();
        }
        catch (error) {
            console.error("Could not create chauffeur:", error);
            setErrorMessage("Could not create chauffeur.");
        }
        finally { setIsSaving(false); }
    }

    return (
        <main>
            {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}

            <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-8`}>
                <div className="grid gap-5 md:grid-cols-2">

                    <label className={formStyles.label}>Name
                        <input value={name} onChange={(event) => setName(event.target.value)} required className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>Email
                        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>Phone
                        <input value={phone} onChange={(event) => setPhone(event.target.value)} required className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>Taxi operator
                        <select value={operatorId} onChange={(event) => setOperatorId(event.target.value)} className={formStyles.selectWFull}>
                            <option value="">No taxi operator assigned</option>
                            {taxiOperatorOptions.map((operator) => (
                                <option key={operator.id} value={operator.id}>{operator.company_name} ({operator.verification_status})</option>
                            ))}
                        </select>
                    </label>

                    <label className={formStyles.label}>Service area
                        <input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>Account status
                        <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)} required className={formStyles.selectWFull}>
                            {accountStatusOptions.map((status) => (
                                <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                            ))}
                        </select>
                    </label>

                    <label className={formStyles.label}>Operational status
                        <select value={operationalStatus} required className={formStyles.selectWFull}
                            onChange={(event) => {
                                const newStatus = event.target.value;
                                setOperationalStatus(newStatus);
                                if (newStatus === "available") { setStatusReason(""); }
                            }}>
                            <option value="available">Available</option>
                            <option value="sick">Sick</option>
                            <option value="on_leave">On leave</option>
                            <option value="unavailable">Unavailable</option>
                        </select>
                    </label>

                    <label className="block md:col-span-2">
                        <span className={formStyles.span}>Operational status reason</span>
                        <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)}
                            className={formStyles.textarea} placeholder="For example: illness or temporary unavailability"/>
                    </label>

                    <label className="flex items-center gap-3 text-sm text-white">
                        <input type="checkbox" checked={acceptsPets} onChange={(event) => setAcceptsPets(event.target.checked)} className="h-5 w-5"/>
                        Accepts pets
                    </label>
                </div>

                <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`}>
                    {isSaving ? "Adding chauffeur..." : "Add chauffeur"}
                </button>
            </form>
        </main>
    );
}
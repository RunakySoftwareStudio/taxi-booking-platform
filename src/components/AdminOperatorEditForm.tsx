"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

type OperatorForEdit = {
    id: string;
    company_name: string;
    kvk_number: string;
    vat_number: string | null;
    p_number: string | null;
    contact_email: string;
    contact_phone: string;
    street: string | null;
    house_number: string | null;
    postal_code: string | null;
    city: string | null;
    country_code: string;
};

type AdminOperatorEditFormProps = {
    operator: OperatorForEdit;
};

/**
 * AdminOperatorEditForm
 *
 * Edits normal taxi-operator business, contact, and address information.
 *
 * Verification status is intentionally not part of this form.
 */
export default function AdminOperatorEditForm({ operator }: AdminOperatorEditFormProps) {
    const [companyName, setCompanyName] = useState(operator.company_name);
    const [kvkNumber, setKvkNumber] = useState(operator.kvk_number);
    const [vatNumber, setVatNumber] = useState(operator.vat_number ?? "");
    const [pNumber, setPNumber] = useState(operator.p_number ?? "");
    const [contactEmail, setContactEmail] = useState(operator.contact_email);
    const [contactPhone, setContactPhone] = useState(operator.contact_phone);
    const [street, setStreet] = useState(operator.street ?? "");
    const [houseNumber, setHouseNumber] = useState(operator.house_number ?? "");
    const [postalCode, setPostalCode] = useState(operator.postal_code ?? "");
    const [city, setCity] = useState(operator.city ?? "");
    const [countryCode, setCountryCode] = useState(operator.country_code);
    const router = useRouter();
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    /**
     * Saves editable operator details.
     *
     * Verification status is deliberately not sent by this form.
     */
    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setSuccessMessage("");
        setErrorMessage("");
        setIsSaving(true);

        try {
            const response = await fetch(`/api/admin/operators/${operator.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyName,
                    kvkNumber,
                    vatNumber,
                    pNumber,
                    contactEmail,
                    contactPhone,
                    street,
                    houseNumber,
                    postalCode,
                    city,
                    countryCode,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message || "Could not update taxi operator.");
                return;
            }

            setSuccessMessage(
                result.message || "Taxi operator details updated successfully."
            );

            /* Tells verification controls that normal operator details changed. */
            window.dispatchEvent(new Event("operator-details-updated"));

            router.refresh();
        }
        catch (error) {
            console.error("Could not update taxi operator:", error);
            setErrorMessage("Could not update taxi operator. Please try again.");
        }
        finally {
            setIsSaving(false);
        }
    }

    return (
        <>
            <div>
                {successMessage && (<p className={pageStyles.successMsgPage}> {successMessage}</p>)}
                {errorMessage && (<p className={pageStyles.errorMsgPage}> {errorMessage} </p>)}
            </div>
            <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-8`}>
                {/* ===== Business details ===== */}
                <div>
                    <h2 className="text-lg font-semibold text-cyan-300">
                        Business details
                    </h2>

                    <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        <label className="block">
                            <span className={formStyles.span}>Company name</span>
                            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)}
                                required className={formStyles.inputWFullCyan}
                            />
                        </label>
                        <label className="block">
                            <span className={formStyles.span}>KvK number</span>
                            <input value={kvkNumber} onChange={(event) => setKvkNumber(event.target.value)}
                                required className={formStyles.inputWFullCyan}
                            />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>VAT number</span>
                            <input value={vatNumber} onChange={(event) => setVatNumber(event.target.value)}
                                className={formStyles.inputWFullCyan}
                            />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>P-number</span>
                            <input value={pNumber}  onChange={(event) => setPNumber(event.target.value)} className={formStyles.inputWFullCyan} />
                        </label>
                    </div>
                    
                    {/* ===== Contact and address ===== */}
                    <div className="mt-6 rounded-xl border border-cyan-400/20 p-4">
                        <h2 className="text-lg font-semibold text-cyan-300">
                            Contact and address
                        </h2>

                        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            <label className="block">
                                <span className={formStyles.span}>Email</span>
                                <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)}
                                    type="email" required className={formStyles.inputWFullCyan}
                                />
                            </label>

                            <label className="block">
                                <span className={formStyles.span}>Phone</span>
                                <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)}
                                    required className={formStyles.inputWFullCyan}
                                />
                            </label>

                            <label className="block">
                                <span className={formStyles.span}>Street</span>
                                <input value={street} onChange={(event) => setStreet(event.target.value)}
                                    className={formStyles.inputWFullCyan}
                                />
                            </label>

                            <label className="block">
                                <span className={formStyles.span}>House number</span>
                                <input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)}
                                    className={formStyles.inputWFullCyan}
                                />
                            </label>

                            <label className="block">
                                <span className={formStyles.span}>Postal code</span>
                                <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)}
                                    className={formStyles.inputWFullCyan}
                                />
                            </label>

                            <label className="block">
                                <span className={formStyles.span}>City</span>
                                <input value={city} onChange={(event) => setCity(event.target.value)}
                                    className={formStyles.inputWFullCyan}
                                />
                            </label>

                            <label className="block">
                                <span className={formStyles.span}>Country code</span>
                                <input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
                                    maxLength={2} required className={`${formStyles.inputWFullCyan} w-24!`}
                                />
                            </label>
                        </div>
                    </div>
                </div>
                <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`}>
                    {isSaving ? "Saving..." : "Save operator details"}
                </button>
            </form>
        </>
    );
}
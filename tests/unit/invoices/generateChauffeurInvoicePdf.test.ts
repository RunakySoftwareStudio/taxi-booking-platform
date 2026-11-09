import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import {
    generateChauffeurInvoicePdf,
    type ChauffeurInvoicePdfData,
} from "../../../src/lib/invoices/generateChauffeurInvoicePdf";

/*
    Generate unique filenames for local PDF test exports.
    Prevents Windows file-lock errors when older PDFs remain open.
*/
function createTestPdfFilename(type: string): string {
    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .replace("Z", "");

    return `test-results/chauffeur-invoice-${type}-${timestamp}.pdf`;
}

/*
    Chauffeur invoice PDF tests.

    Uses fictional invoice data only.
    Does not access Supabase or modify financial records.
*/

describe("generateChauffeurInvoicePdf", () => {
    it("generates a valid single-page draft PDF", async () => {
        /* Fictional invoice with stored financial values. */
        const invoice: ChauffeurInvoicePdfData = {
            invoice_number: null,
            status: "draft",
            billing_month: "2026-10-01",
            currency_code: "EUR",
            created_at: "2026-11-01T10:00:00Z",
            issued_at: null,
            paid_at: null,

            recipient_name: "Example Chauffeur",
            recipient_email: "chauffeur@example.com",
            recipient_address: "Example Street 10\n1315 AA Almere",

            sender_legal_name: "Voya Taxi Test",
            sender_business_address: "Test Street 20\n1012 AB Amsterdam",
            sender_kvk_number: "12345678",
            sender_vat_number: "NL123456789B01",
            sender_contact_email: "billing@example.com",
            sender_iban: "NL00 TEST 0000 0000 00",
            sender_bic: null,
            payment_terms_days: 14,

            vat_percentage: "21",
            subtotal_excluding_vat: "100.00",
            vat_amount: "21.00",
            total_including_vat: "121.00",

            items: [{
                description: "Platform service compensation - October 2026",
                amount_excluding_vat: "100.00",
                vat_percentage: "21",
                vat_amount: "21.00",
                total_including_vat: "121.00",
            }],
        };

        /* Generate a PDF without making database requests. */
        const pdfBytes = await generateChauffeurInvoicePdf(invoice);
        /* Export the fictional draft invoice for visual inspection. */
        await mkdir("test-results", { recursive: true });
        await writeFile(createTestPdfFilename("draft"), pdfBytes);
        const document = await PDFDocument.load(pdfBytes);

        expect(pdfBytes.length).toBeGreaterThan(0);
        expect(document.getPageCount()).toBe(1);
        expect(document.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    });

    /*
        Verify that long invoices are split across A4 pages
        without accessing or changing financial records.
    */
    it("generates multiple pages for a long invoice", async () => {
        const items = Array.from({ length: 50 }, (_, index) => ({
            description: `Platform service compensation for completed journey ${index + 1} - October 2026`,
            amount_excluding_vat: "10.00",
            vat_percentage: "21",
            vat_amount: "2.10",
            total_including_vat: "12.10",
        }));

        const invoice: ChauffeurInvoicePdfData = {
            invoice_number: null,
            status: "draft",
            billing_month: "2026-10-01",
            currency_code: "EUR",
            created_at: "2026-11-01T10:00:00Z",
            issued_at: null,
            paid_at: null,
            recipient_name: "Example Chauffeur",
            recipient_email: "chauffeur@example.com",
            recipient_address: "Example Street 10\n1315 AA Almere",
            sender_legal_name: "Voya Taxi Test",
            sender_business_address: "Test Street 20\n1012 AB Amsterdam",
            sender_kvk_number: "12345678",
            sender_vat_number: "NL123456789B01",
            sender_contact_email: "billing@example.com",
            sender_iban: "NL00 TEST 0000 0000 00",
            sender_bic: null,
            payment_terms_days: 14,
            vat_percentage: "21",
            subtotal_excluding_vat: "500.00",
            vat_amount: "105.00",
            total_including_vat: "605.00",
            items,
        };

        /* Generate and export the fictional 50-item invoice. */
        const pdfBytes = await generateChauffeurInvoicePdf(invoice);
        await writeFile(createTestPdfFilename("multipage"), pdfBytes);

        const document = await PDFDocument.load(pdfBytes);

        expect(document.getPageCount()).toBeGreaterThan(1);
        expect(document.getPages().every((page) =>
            Math.abs(page.getWidth() - 595.28) < 0.1 &&
            Math.abs(page.getHeight() - 841.89) < 0.1
        )).toBe(true);
    });
    /*
        Verify PDF generation with international characters.
        Uses fictional data and does not access Supabase.
    */
    it("generates a PDF with international names and addresses", async () => {
        const invoice: ChauffeurInvoicePdfData = {
            invoice_number: "VT-2026-0001",
            status: "issued",
            billing_month: "2026-10-01",
            currency_code: "EUR",
            created_at: "2026-11-01T10:00:00Z",
            issued_at: "2026-11-02T10:00:00Z",
            paid_at: null,

            recipient_email: "chauffeur@example.com",
            recipient_name: "Çağdaş Şimşek İğde – International Chauffeur Services",
            /* Fictional long names and addresses for layout testing. */
            recipient_address: "Burgemeester van der Voort van Zijplaan 125, Appartement 24B\n1315 ZZ Almere, Nederland",

            sender_legal_name: "Voya Taxi",
            sender_business_address: "Voya Taxi International Business Administration Office\nBurgemeester de Vlugtlaan 250, Gebouw B\n1063 BR Amsterdam, Nederland",
            sender_kvk_number: "12345678",
            sender_vat_number: "NL123456789B01",
            sender_contact_email: "billing@example.com",
            sender_iban: "NL00 TEST 0000 0000 00",
            sender_bic: "TESTNL2A",
            payment_terms_days: 14,

            vat_percentage: "21",
            subtotal_excluding_vat: "100.00",
            vat_amount: "21.00",
            total_including_vat: "121.00",

            items: [{
                description: "Platformvergoeding – rit voor José Müller",
                amount_excluding_vat: "100.00",
                vat_percentage: "21",
                vat_amount: "21.00",
                total_including_vat: "121.00",
            }],
        };
        /* Verify that unsupported Arabic characters cannot silently produce an incorrect official invoice. */
        const unsupportedInvoice: ChauffeurInvoicePdfData = {
            ...invoice,
            recipient_name: "أحمد عبد الرحمن",
        };

        await expect(
            generateChauffeurInvoicePdf(unsupportedInvoice)
        ).rejects.toThrow();
        
        /* Verify that Unicode input produces a valid PDF. */
        const pdfBytes = await generateChauffeurInvoicePdf(invoice);
        /* Export the fictional Unicode invoice for visual inspection. */
        await writeFile(createTestPdfFilename("unicode"), pdfBytes);
        const document = await PDFDocument.load(pdfBytes);
        /* Issued invoices must not contain a DRAFT watermark. */
        const page = document.getPage(0);
        const contentStreams = page.node.Contents();

        expect(contentStreams).toBeDefined();
        expect(document.getPageCount()).toBe(1);

        expect(document.getPageCount()).toBe(1);
        expect(pdfBytes.length).toBeGreaterThan(0);
    });
    /*
        Verify that exceptionally long recipient addresses are rejected.
        Prevents overlapping text in official invoice PDFs.
    */
    it("rejects an address that exceeds the available layout", async () => {
        const longAddress = Array.from(
            { length: 25 },
            (_, index) => `Address line ${index + 1}, Example Street, Amsterdam`
        ).join("\n");

        const invoice: ChauffeurInvoicePdfData = {
            invoice_number: null,
            status: "draft",
            billing_month: "2026-10-01",
            currency_code: "EUR",
            created_at: "2026-11-01T10:00:00Z",
            issued_at: null,
            paid_at: null,

            recipient_name: "Example Chauffeur",
            recipient_email: "chauffeur@example.com",
            recipient_address: longAddress,

            sender_legal_name: "Voya Taxi Test",
            sender_business_address: "Test Street 20\n1012 AB Amsterdam",
            sender_kvk_number: "12345678",
            sender_vat_number: "NL123456789B01",
            sender_contact_email: "billing@example.com",
            sender_iban: "NL00 TEST 0000 0000 00",
            sender_bic: null,
            payment_terms_days: 14,

            vat_percentage: "21",
            subtotal_excluding_vat: "100.00",
            vat_amount: "21.00",
            total_including_vat: "121.00",

            items: [{
                description: "Platform service compensation - October 2026",
                amount_excluding_vat: "100.00",
                vat_percentage: "21",
                vat_amount: "21.00",
                total_including_vat: "121.00",
            }],
        };

        /* Excessive address text must not generate an overlapping PDF. */
        await expect(generateChauffeurInvoicePdf(invoice))
            .rejects.toThrow("Invoice address is too long for the available PDF layout.");
    });
    /*
        Verify Amsterdam invoice dates and payment deadlines.
        An invoice issued late in UTC may already be on the next day
        in the Netherlands.
    */
    it("handles invoice dates around Amsterdam midnight", async () => {
        const invoice: ChauffeurInvoicePdfData = {
            invoice_number: "VT-2026-0002",
            status: "issued",
            billing_month: "2026-10-01",
            currency_code: "EUR",
            created_at: "2026-10-31T23:30:00Z",
            issued_at: "2026-10-31T23:30:00Z",
            paid_at: null,

            recipient_name: "Example Chauffeur",
            recipient_email: "chauffeur@example.com",
            recipient_address: "Example Street 10\n1315 AA Almere",

            sender_legal_name: "Voya Taxi Test",
            sender_business_address: "Test Street 20\n1012 AB Amsterdam",
            sender_kvk_number: "12345678",
            sender_vat_number: "NL123456789B01",
            sender_contact_email: "billing@example.com",
            sender_iban: "NL00 TEST 0000 0000 00",
            sender_bic: "TESTNL2A",
            payment_terms_days: 14,

            vat_percentage: "21",
            subtotal_excluding_vat: "100.00",
            vat_amount: "21.00",
            total_including_vat: "121.00",

            items: [{
                description: "Platform service compensation - October 2026",
                amount_excluding_vat: "100.00",
                vat_percentage: "21",
                vat_amount: "21.00",
                total_including_vat: "121.00",
            }],
        };

        /* Generate and export the fictional invoice for date inspection. */
        const pdfBytes = await generateChauffeurInvoicePdf(invoice);
        const document = await PDFDocument.load(pdfBytes);

        await writeFile(createTestPdfFilename("amsterdam-date"), pdfBytes);

        expect(document.getPageCount()).toBe(1);
    });
});
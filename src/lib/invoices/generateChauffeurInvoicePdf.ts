
import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
/*
    VOYA TAXI — CHAUFFEUR INVOICE PDF GENERATOR

    Generates PDF documents using stored invoice information.

    Financial rules:
    - Never recalculate commissions.
    - Never modify invoice records.
    - Use frozen invoice information for issued invoices.
    - Clearly identify draft invoice previews.
*/

/* Standard A4 page dimensions in PDF points. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

/* Shared styling for professional invoice documents. */
const PDF_COLORS = {
    navy: rgb(0.06, 0.12, 0.20),
    cyan: rgb(0.02, 0.65, 0.80),
    dark: rgb(0.15, 0.20, 0.27),
    muted: rgb(0.42, 0.47, 0.53),
    light: rgb(0.93, 0.96, 0.98),
};

/*
    Invoice data contract for PDF generation.
    Monetary values remain strings to preserve the decimal representation retrieved from PostgreSQL NUMERIC columns.
    No commission or VAT recalculation is performed here.
*/
export type ChauffeurInvoicePdfData = {
    invoice_number: string | null;
    status: string;
    billing_month: string;
    currency_code: string;
    created_at: string;
    issued_at: string | null;
    paid_at: string | null;

    recipient_name: string | null;
    recipient_email: string | null;
    recipient_address: string | null;

    sender_legal_name: string | null;
    sender_business_address: string | null;
    sender_kvk_number: string | null;
    sender_vat_number: string | null;
    sender_contact_email: string | null;
    sender_iban: string | null;
    sender_bic: string | null;
    payment_terms_days: number | null;

    vat_percentage: string | null;
    subtotal_excluding_vat: string;
    vat_amount: string;
    total_including_vat: string;

    items: {
        description: string;
        amount_excluding_vat: string;
        vat_percentage: string;
        vat_amount: string;
        total_including_vat: string;
    }[];
};

/*
    PDF display helpers.
    These functions format stored invoice information.
    They never recalculate commissions, VAT or invoice totals.
*/

/*
    Format invoice dates using the Netherlands calendar.

    DATE values retain their original calendar date.
    TIMESTAMPTZ values are converted to Europe/Amsterdam.
*/
function formatInvoiceDate(value: string | null): string {
    if (!value) return "Not issued";

    /* PostgreSQL DATE: preserve the stored calendar date. */
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-");
        return `${day}-${month}-${year}`;
    }

    /* PostgreSQL TIMESTAMPTZ: convert to Amsterdam local time. */
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) { return "Invalid date"; }

    return new Intl.DateTimeFormat("nl-NL", {
        timeZone: "Europe/Amsterdam",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date).replace(/\//g, "-");
}

/* Display stored decimal amounts using Dutch number formatting. */
function formatInvoiceAmount(value: string, currencyCode: string): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return `${currencyCode} ${value}`;

    return `${currencyCode} ${new Intl.NumberFormat("nl-NL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)}`;
}

/* Format stored invoice amounts compactly for narrow table columns. */
function formatInvoiceTableAmount(value: string): string {
    const amount = Number(value);

    if (!Number.isFinite(amount)) return value;

    return new Intl.NumberFormat("nl-NL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/*
    Preserve international characters in invoice text.
    Remove only control characters that should not appear in PDF text.
    Unsupported font glyphs must be detected during PDF generation,
    never silently replaced with question marks.
*/
function safePdfText(value: string | null | undefined): string {
    return (value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ");
}

/*
    Draw the invoice header on an A4 page.

    Draft invoices receive a visible watermark and cannot
    be mistaken for officially issued invoices.
*/
export async function generateChauffeurInvoicePdf(data: ChauffeurInvoicePdfData): Promise<Uint8Array> {
    
    /*
        Reject Arabic-script text until Arabic font and RTL support
        are implemented. Never generate an official invoice with
        potentially missing or incorrectly shaped Arabic text.
    */
    const invoiceText = [
        data.invoice_number,
        data.recipient_name,
        data.recipient_email,
        data.recipient_address,
        data.sender_legal_name,
        data.sender_business_address,
        data.sender_kvk_number,
        data.sender_vat_number,
        data.sender_contact_email,
        data.sender_iban,
        data.sender_bic,
        ...data.items.map((item) => item.description),
    ].filter((value): value is string => typeof value === "string");

    if (invoiceText.some((value) => /\p{Script=Arabic}/u.test(value))) {
        throw new Error("Arabic script is not supported in invoice PDFs yet.");
    }

    const { pdf, regularFont, boldFont } = await createChauffeurInvoicePdfDocument();

    /* The active page changes when the invoice table needs another page. */
    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const isDraft = data.status === "draft";
    const margin = 45;

    /* Document heading and company identity. */
    page.drawRectangle({
        x: 0, y: PAGE_HEIGHT - 115, width: PAGE_WIDTH, height: 115,
        color: PDF_COLORS.navy,
    });

    page.drawText("VOYA TAXI", {
        x: margin, y: PAGE_HEIGHT - 65, size: 25,
        font: boldFont, color: PDF_COLORS.cyan,
    });

    page.drawText(isDraft ? "DRAFT INVOICE" : "INVOICE", {
        x: margin, y: PAGE_HEIGHT - 91, size: 11,
        font: regularFont, color: rgb(1, 1, 1),
    });

    /* Display the official invoice number only if available. */
    page.drawText(safePdfText(data.invoice_number ?? "Not assigned"), {
        x: PAGE_WIDTH - 220, y: PAGE_HEIGHT - 80,
        size: 12, font: boldFont, color: rgb(1, 1, 1),
    });

    /* Clearly distinguish draft documents from official invoices. */
    if (isDraft) {
        page.drawText("DRAFT", {
            x: 115, y: 390, size: 100, rotate: degrees(35),
            opacity: 0.12, font: boldFont, color: PDF_COLORS.muted,
        });
    }

    /* Remaining invoice sections will be added in the next steps. */
    /* SECTION 2: Display sender and recipient information. */
    const senderX = margin;
    const recipientX = 310;
    const detailsY = PAGE_HEIGHT - 155;
    const lineHeight = 17;

    /*
        Draw sender or recipient information within its assigned column.
        Wrap long names, addresses and email addresses automatically.
        Long chauffeur names wrap inside the recipient column.
        -Long street addresses no longer extend into the adjacent column.
        -Long email addresses are split when necessary.
        -Existing line breaks remain respected.
        -Dutch and Turkish characters remain preserved.
    */
    function drawAddressBlock(title: string, lines: (string | null)[], x: number) {
        const columnWidth = x === senderX ? recipientX - senderX - 25 : PAGE_WIDTH - margin - recipientX;
        const fontSize = 9;

        page.drawText(title, {
            x, y: detailsY, size: 11,
            font: boldFont, color: PDF_COLORS.navy,
        });

        let y = detailsY - 23;

        for (const value of lines) {
            if (!value) continue;

            /* Preserve explicit address line breaks before wrapping. */
            for (const originalLine of value.split(/\r?\n/)) {
                const wrappedLines = wrapDescription(originalLine, columnWidth, fontSize);

                /* Prevent long address blocks from overlapping invoice metadata. */
                for (const line of wrappedLines) {
                    const addressBottomLimit = PAGE_HEIGHT - 340;
                    if (y < addressBottomLimit) { throw new Error("Invoice address is too long for the available PDF layout."); }
                    page.drawText(line, {x, y, size: fontSize,font: regularFont, color: PDF_COLORS.dark, });
                    y -= lineHeight;
                }
            }
        }
    }

    /* Use stored sender information from the invoice. */
    drawAddressBlock("FROM", [
        data.sender_legal_name ?? "Voya Taxi",
        data.sender_business_address,
        data.sender_contact_email,
        data.sender_kvk_number ? `KVK: ${data.sender_kvk_number}` : null,
        data.sender_vat_number ? `VAT: ${data.sender_vat_number}` : null,
    ], senderX);

    /* Use the stored chauffeur recipient information. */
    drawAddressBlock("BILL TO", [
        data.recipient_name ?? "Not finalized",
        data.recipient_address,
        data.recipient_email,
    ], recipientX);

    /* SECTION 3: Display invoice dates and payment terms. */
    const metadataY = PAGE_HEIGHT - 355;

    /*
        Calculate the payment deadline using the Amsterdam calendar date.
        Handles daylight-saving changes without modifying invoice data.
    */
    function getDueDate(): string {
        if (!data.issued_at || data.payment_terms_days == null) return "Not issued";

        const issuedDate = new Date(data.issued_at);
        if (Number.isNaN(issuedDate.getTime())) return "Not available";

        /* Determine the local calendar date when the invoice was issued. */
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Amsterdam",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(issuedDate);

        const getPart = (type: string) =>
            Number(parts.find((part) => part.type === type)?.value);

        const year = getPart("year");
        const month = getPart("month");
        const day = getPart("day");

        /* Add calendar days using UTC date arithmetic to avoid DST shifts. */
        const dueDate = new Date(Date.UTC(
            year, month - 1, day + data.payment_terms_days
        ));

        const dd = String(dueDate.getUTCDate()).padStart(2, "0");
        const mm = String(dueDate.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = dueDate.getUTCFullYear();

        return `${dd}-${mm}-${yyyy}`;
    }

    /* Draw a labeled invoice information row. */
    function drawInvoiceInfo(label: string, value: string, y: number) {
        page.drawText(label, {
            x: margin, y, size: 10,
            font: boldFont, color: PDF_COLORS.navy,
        });

        page.drawText(safePdfText(value), {
            x: 185, y, size: 10,
            font: regularFont, color: PDF_COLORS.dark,
        });
    }

    drawInvoiceInfo("Billing month", formatInvoiceDate(data.billing_month), metadataY);
    drawInvoiceInfo("Invoice date", formatInvoiceDate(data.issued_at), metadataY - 20);
    drawInvoiceInfo("Payment terms", data.payment_terms_days == null
        ? "Not finalized"
        : `${data.payment_terms_days} days`, metadataY - 40);
    drawInvoiceInfo("Payment due", getDueDate(), metadataY - 60);

    /* SECTION 4: Draw the frozen invoice items table. */
    
    /* SECTION 4: Draw frozen invoice items with automatic page breaks. */
    const tableX = margin;
    const tableWidth = PAGE_WIDTH - margin * 2;
    const minimumY = 85;

    /* Right edges of financial columns within the A4 table. */
    const columns = {
        description: tableX + 10,
        subtotal: tableX + 285,
        vatRate: tableX + 340,
        vat: tableX + 415,
        total: tableX + tableWidth - 10,
    };

    /* Draw table headings on the current PDF page. */
    function drawTableHeader(headerY: number) {
        page.drawRectangle({
            x: tableX, y: headerY - 9,
            width: tableWidth, height: 27,
            color: PDF_COLORS.navy,
        });

        const headings = [
            ["Description", columns.description],
            ["Excl. VAT", columns.subtotal],
            ["VAT %", columns.vatRate],
            ["VAT", columns.vat],
            ["Total", columns.total],
        ] as const;

        /* Align numeric headings with their right-aligned financial values. */
        for (const [label, x] of headings) {
            const fontSize = 8;
            const isDescription = label === "Description";
            const textWidth = boldFont.widthOfTextAtSize(label, fontSize);

            page.drawText(label, {
                x: isDescription ? x : x - textWidth,
                y: headerY,
                size: fontSize,
                font: boldFont,
                color: rgb(1, 1, 1),
            });
        }
    }

    /*
        Wrap invoice descriptions using actual PDF font measurements.
        Preserve complete words whenever they fit within the column.
        Split individual words only when they exceed the column width.
    */
    /* Allow the wrapping helper to support different PDF text sizes. */
    function wrapDescription(text: string, maxWidth: number, fontSize = 8): string[] {
        const words = safePdfText(text).split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let currentLine = "";

        for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;

            /* Keep the word on the current line when it fits. */
            if (regularFont.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
                currentLine = candidate;
                continue;
            }

            /* Finish the current line before processing the next word. */
            if (currentLine) {
                lines.push(currentLine);
                currentLine = "";
            }

            /* A complete word fits on a fresh line. */
            if (regularFont.widthOfTextAtSize(word, fontSize) <= maxWidth) {
                currentLine = word;
                continue;
            }

            /* Split only exceptionally long individual words. */
            for (const character of word) {
                const candidateWord = currentLine + character;

                if (regularFont.widthOfTextAtSize(candidateWord, fontSize) > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = character;
                } else {
                    currentLine = candidateWord;
                }
            }
        }

        if (currentLine) lines.push(currentLine);

        return lines.length ? lines : [""];
    }

    /*
        Draw invoice table text within its assigned column.
        Reduce font size when necessary and reject values that cannot fit.
        Never truncate financial information.
    */
    function drawTableText(text: string, x: number, y: number, rightAligned = false, maxWidth?: number) {
        const content = safePdfText(text);
        let fontSize = 8;

        /* Reduce text size only when a column width is specified. */
        if (maxWidth !== undefined) {
            while (fontSize > 6 && regularFont.widthOfTextAtSize(content, fontSize) > maxWidth) {
                fontSize -= 0.5;
            }

            if (regularFont.widthOfTextAtSize(content, fontSize) > maxWidth) {
                throw new Error("Invoice table value exceeds the available column width.");
            }
        }

        const textWidth = regularFont.widthOfTextAtSize(content, fontSize);

        page.drawText(content, {
            x: rightAligned ? x - textWidth : x,
            y, size: fontSize, font: regularFont,
            color: PDF_COLORS.dark,
        });
    }

    /* Create an additional invoice page when the current page is full. */
    function addContinuationPage(): number {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

        page.drawText("VOYA TAXI - INVOICE CONTINUED", {
            x: margin, y: PAGE_HEIGHT - 48,
            size: 12, font: boldFont, color: PDF_COLORS.navy,
        });

        if (isDraft) {
            page.drawText("DRAFT", {
                x: 115, y: 390, size: 100,
                rotate: degrees(35), opacity: 0.12,
                font: boldFont, color: PDF_COLORS.muted,
            });
        }

        const continuationHeaderY = PAGE_HEIGHT - 95;
        drawTableHeader(continuationHeaderY);

        return continuationHeaderY - 30;
    }

    /* Start the item table below the invoice metadata. */
    const tableHeaderY = metadataY - 95;
    drawTableHeader(tableHeaderY);

    let itemY = tableHeaderY - 30;

    /* Draw wrapped invoice descriptions with automatic page breaks. */
    for (const item of data.items) {
        const descriptionLines = wrapDescription(item.description, 175);
        const lineHeight = 12;
        const rowPadding = 12;
        let lineIndex = 0;
        let firstPart = true;

        /* Keep the entire invoice item together when it fits on a fresh page. */
        const completeRowHeight = Math.max(
            24,
            descriptionLines.length * lineHeight + rowPadding
        );

        if (
            itemY - completeRowHeight < minimumY &&
            completeRowHeight <= PAGE_HEIGHT - 125 - minimumY
        ) {
            itemY = addContinuationPage();
        }

        /* Split unusually long descriptions across pages when necessary. */
        while (lineIndex < descriptionLines.length) {
            /* Reserve enough room for at least one complete invoice row. */
            if (itemY - Math.max(24, lineHeight + rowPadding) < minimumY) {itemY = addContinuationPage(); }
            /* Include row padding when calculating available description lines. */
            const availableLines = Math.max(1, Math.floor((itemY - minimumY - rowPadding) / lineHeight));
            const lines = descriptionLines.slice(lineIndex, lineIndex + availableLines);

            /* Draw each description line within its assigned column. */
            lines.forEach((line, index) => {
                drawTableText(line, columns.description, itemY - index * lineHeight);
            });

            /* Financial amounts appear once, beside the first description line. */
            if (firstPart) {
                /* Respect the available width of each financial column. */
                drawTableText(formatInvoiceTableAmount(item.amount_excluding_vat), columns.subtotal, itemY, true, 85);
                drawTableText(`${item.vat_percentage}%`, columns.vatRate, itemY, true, 45);
                drawTableText(formatInvoiceTableAmount(item.vat_amount), columns.vat, itemY, true, 65);
                drawTableText(formatInvoiceTableAmount(item.total_including_vat), columns.total, itemY, true, 70);
                firstPart = false;
            }

            const rowHeight = Math.max(24, lines.length * lineHeight + rowPadding);
            const rowBottom = itemY - rowHeight;

            /* Separate invoice items with a subtle horizontal line. */
            page.drawLine({
                start: { x: tableX, y: rowBottom + 4 },
                end: { x: tableX + tableWidth, y: rowBottom + 4 },
                thickness: 0.5,
                color: PDF_COLORS.light,
            });

            itemY = rowBottom;
            lineIndex += lines.length;

            /* Continue the same description on another page if required. */
            if (lineIndex < descriptionLines.length) {
                itemY = addContinuationPage();
            }
        }
    }

    /* SECTION 5: Display stored invoice totals after the final item. */
    /* Reserve space for financial totals and payment instructions. */
    const totalsHeight = 190;

    /* Keep the complete totals section together on one page. */
    if (itemY - totalsHeight < 65) {
        itemY = addContinuationPage();
    }

    const totalsX = PAGE_WIDTH - margin - 245;
    let totalsY = itemY - 25;

    /* Draw a financial total without recalculating stored amounts. */
    function drawTotal(label: string, amount: string, emphasized = false) {
        const font = emphasized ? boldFont : regularFont;
        const size = emphasized ? 11 : 9;
        const value = formatInvoiceAmount(amount, data.currency_code);
        const valueWidth = font.widthOfTextAtSize(value, size);

        page.drawText(label, {
            x: totalsX, y: totalsY, size,
            font, color: PDF_COLORS.dark,
        });

        page.drawText(value, {
            x: PAGE_WIDTH - margin - valueWidth,
            y: totalsY, size,
            font, color: emphasized ? PDF_COLORS.navy : PDF_COLORS.dark,
        });

        totalsY -= emphasized ? 30 : 22;
    }

    /* Use the frozen invoice header values. */
    drawTotal("Subtotal excl. VAT", data.subtotal_excluding_vat);
    drawTotal("VAT", data.vat_amount);

    page.drawLine({
        start: { x: totalsX, y: totalsY + 12 },
        end: { x: PAGE_WIDTH - margin, y: totalsY + 12 },
        thickness: 1,
        color: PDF_COLORS.navy,
    });

    drawTotal("Total due", data.total_including_vat, true);
    
    /* SECTION 6: Display frozen invoice payment instructions. */
    const paymentY = totalsY - 10;

    page.drawText("PAYMENT INFORMATION", {
        x: margin, y: paymentY, size: 10,
        font: boldFont, color: PDF_COLORS.navy,
    });

    /* Draw a payment detail using the invoice's stored values. */
    function drawPaymentDetail(label: string, value: string, y: number) {
        page.drawText(label, {
            x: margin, y, size: 9,
            font: boldFont, color: PDF_COLORS.dark,
        });

        page.drawText(safePdfText(value), {
            x: 170, y, size: 9,
            font: regularFont, color: PDF_COLORS.dark,
        });
    }

    drawPaymentDetail("IBAN", data.sender_iban ?? "Not finalized", paymentY - 22);
    if (data.sender_bic) {drawPaymentDetail("BIC / SWIFT", data.sender_bic, paymentY - 39);}

    drawPaymentDetail(
        "Payment reference",
        data.invoice_number ?? "Not assigned",
        paymentY - 56
    );

    /* Return the completed PDF document as bytes. */
    return pdf.save();

}

/*
    Initialize the invoice PDF with embedded Unicode fonts.

    Font files are loaded locally from the Voya Taxi project.
    No external requests or database operations are performed.
*/
export async function createChauffeurInvoicePdfDocument() {
    const pdf = await PDFDocument.create();

    /* Register fontkit to support custom TrueType fonts. */
    pdf.registerFontkit(fontkit);

    /* Load the licensed Noto Sans fonts from the project. */
    const fontDirectory = path.join(process.cwd(), "public", "fonts");

    const [regularBytes, boldBytes] = await Promise.all([
        readFile(path.join(fontDirectory, "NotoSans-Regular.ttf")),
        readFile(path.join(fontDirectory, "NotoSans-Bold.ttf")),
    ]);

    /* Embed the fonts directly into the generated PDF. */
    const regularFont = await pdf.embedFont(regularBytes);
    const boldFont = await pdf.embedFont(boldBytes);

    return { pdf, regularFont, boldFont, PAGE_WIDTH, PAGE_HEIGHT, PDF_COLORS };
}


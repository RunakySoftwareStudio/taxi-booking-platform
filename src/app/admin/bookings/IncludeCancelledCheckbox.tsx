"use client";

/* Automatically submits the existing GET filter form when toggled. */
type IncludeCancelledCheckboxProps = {
    includeCancelled: boolean;
};

export default function IncludeCancelledCheckbox({ includeCancelled }: IncludeCancelledCheckboxProps) {
    return (
        <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
            <input type="checkbox" name="includeCancelled"
                value="true" defaultChecked={includeCancelled}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="h-6 w-6 shrink-0 cursor-pointer accent-cyan-500"
            />
            Show cancelled bookings only
        </label>
    );
}

"use client";

import { useState } from "react";

/* ============================================================
   TimeInput24 - Reusable 24-hour time selector.

   - Hours: 00 to 23.
   - Minutes: 00 to 59.
   - No AM/PM.
   - Submits one HH:mm value using the original form name.
============================================================ */
type TimeInput24Props = {
    name: string;
    defaultValue?: string;
    value?: string;
    onChange?: (newTime: string) => void;
    required?: boolean;
    className?: string;
    label?: string;
};

/* Create two-digit options for the hour/minute dropdowns. */
const createTimeOptions = (count: number) =>
    Array.from({ length: count }, (_, index) => String(index).padStart(2, "0"));

const hours = createTimeOptions(24);
const minutes = createTimeOptions(60);

/* Render a 24-hour time selector supporting controlled and uncontrolled forms. */
export default function TimeInput24({ name, defaultValue = "00:00", value, onChange, required = false, className = "", label }: TimeInput24Props) {
    const [internalTime, setInternalTime] = useState(defaultValue);
    const currentTime = value ?? internalTime;
    const [hour = "00", minute = "00"] = currentTime.split(":");

    /* Update the selected time and notify the parent form. */
    function handleTimeChange(newHour: string, newMinute: string) {
        const newTime = `${newHour}:${newMinute}`;
        if (value === undefined) setInternalTime(newTime);
        onChange?.(newTime);
    }

    return (
        <div className="flex items-center gap-2">
            {/* Submit one HH:mm value with the existing form field name. */}
            <input type="hidden" name={name} value={currentTime} />

            {/* Select hours between 00 and 23. */}
            <select aria-label={`${label ?? name} hour`} value={hour} required={required}
                onChange={(event) => handleTimeChange(event.target.value, minute)}
                className={`${className} min-w-0 flex-1`}>
                {hours.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>

            <span className="font-semibold">:</span>

            {/* Select minutes between 00 and 59. */}
            <select aria-label={`${label ?? name} minute`} value={minute} required={required}
                onChange={(event) => handleTimeChange(hour, event.target.value)}
                className={`${className} min-w-0 flex-1`}>
                {minutes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
        </div>
    );
}

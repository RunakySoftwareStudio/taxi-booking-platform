"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { formStyles } from "@/styles/classNames";

type DateTimeInputWithClearProps = {
    name: string;
    defaultValue: string;
};

export default function DateTimeInputWithClear({ name, defaultValue }: DateTimeInputWithClearProps) {
    const [dateValue, setDateValue] = useState(defaultValue);

    function handleClearDate() {
        setDateValue("");
    }

    return (
        <div className="relative">
        <input name={name} type="datetime-local" value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
            className={`${formStyles.inputWFullCyan} datetimeInput`}/> 
            <button type="button" onClick={handleClearDate} disabled={!dateValue} aria-label="Clear date" title="Clear date"
                className="absolute right-14 top-2 text-cyan-300 transition hover:text-red-300 disabled:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed">
                <Trash2 size={19} strokeWidth={2.2}/>
            </button>
        </div>
    );
}   
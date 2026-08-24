
"use client";

import { useState } from "react";
import { formStyles } from "@/styles/classNames";

/* ===== Weekly schedule editor row ===== */
export type WeeklyScheduleEditorRow = {
    id: string;
    dayOfWeek: number;
    startLocalTime: string;
    endLocalTime: string;
    pricingProfileCode: string;
};

/* ===== Pricing-profile option ===== */
export type WeeklyScheduleProfileOption = {
    pricingProfileCode: string;
    pricingProfileName: string;
};

/* ===== Component properties ===== */
type WeeklyScheduleEditorProps = {
    countryCode: string;
    initialSchedule: WeeklyScheduleEditorRow[];
    pricingProfileOptions: WeeklyScheduleProfileOption[];
    saveAction: (formData: FormData) => void | Promise<void>;
    initialError?: string;
};

/**
 * Purpose:
 * Allows an administrator to review and edit the complete recurring
 * weekly pricing schedule while a pricing market is still under review.
 */
export default function WeeklyScheduleEditor({countryCode, initialSchedule, pricingProfileOptions, saveAction,initialError}: WeeklyScheduleEditorProps) {

    /* ===== Editable weekly schedule ===== */
    const [scheduleRows, setScheduleRows] = useState(initialSchedule);

    /* ===== Group editable weekly schedule by day ===== */
    const scheduleRowsByDay = Array.from({ length: 7 }, (_, dayIndex) => {
        const dayOfWeek = dayIndex + 1;
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

        return {
            dayOfWeek,
            dayName: dayNames[dayIndex],
            periods: scheduleRows
                .filter((scheduleRow) => scheduleRow.dayOfWeek === dayOfWeek)
                .sort((firstRow, secondRow) => firstRow.startLocalTime.localeCompare(secondRow.startLocalTime)),
        };
    });

    /* ===== Previous save error ===== */
    const [editorError, setEditorError] = useState(initialError);

    /* ===== Clear previous save error when admin starts editing again ===== */
    function clearPreviousError() {
        setEditorError(undefined);

        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("error");

        window.history.replaceState(
            null,
            "",
            `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
        );
    }

    /* ===== Check for unsaved weekly schedule changes ===== */
    const hasUnsavedChanges = JSON.stringify(scheduleRows) !== JSON.stringify(initialSchedule);

    /* ===== Update one weekly schedule value ===== */
    function updateScheduleRow(
        rowId: string,
        field: "startLocalTime" | "endLocalTime" | "pricingProfileCode",
        newValue: string
    ) {
        clearPreviousError();
        setScheduleRows((currentRows) =>
            currentRows.map((scheduleRow) =>
                scheduleRow.id === rowId ? { ...scheduleRow, [field]: newValue } : scheduleRow
            )
        );
    }

    /* ===== Add weekly schedule period ===== */
    /*
        What happens here?

        First:
        const defaultProfileCode = pricingProfileOptions[0]?.pricingProfileCode;
        means: Take the first available pricing-profile family.
        For Germany that might be something like: DE_DAYTIME_STANDARD

        The ?. means:
            If item 0 does not exist, don't crash; return undefined.
        Then:
            if (!defaultProfileCode) { return; }
            protects us from adding an unusable row when no profile exists.
        This:
            id: crypto.randomUUID(),
            creates a temporary unique browser ID, for example:
            7d05be99-df07-4c80-b204-...
        This ID is only for React:  key={scheduleRow.id}
        It is not sent to PostgreSQL when we save.

        setScheduleRows((currentRows) => [...currentRows, newScheduleRow]);
        means:
            take all existing rows
                    +
            add the new row at the end
        So:
            17 rows
            ↓ Add period
            18 rows 
    */
        function addScheduleRow(dayOfWeek: number) {
            clearPreviousError();

            const defaultProfileCode = pricingProfileOptions[0]?.pricingProfileCode;
            if (!defaultProfileCode) { return; }

            const newScheduleRow: WeeklyScheduleEditorRow = {
                id: crypto.randomUUID(),
                dayOfWeek,
                startLocalTime: "00:00",
                endLocalTime: "01:00",
                pricingProfileCode: defaultProfileCode,
        };

        /* those set the newly created row either at the top or bottom of the grid
        setScheduleRows((currentRows) => [...currentRows, newScheduleRow]);
            [existing rows..., new row]
                    ↑
               bottom of page

        setScheduleRows((currentRows) => [newScheduleRow, ...currentRows]);
            [new row, existing rows...]
            ↑
            immediately visible 
        */
        setScheduleRows((currentRows) => [newScheduleRow, ...currentRows]);
    }

    /* ===== Remove weekly schedule period ===== */
    function removeScheduleRow(rowId: string) {
        clearPreviousError();
        setScheduleRows((currentRows) =>
            currentRows.filter((scheduleRow) => scheduleRow.id !== rowId) //Keep every row whose ID is not the one we want to remove.
        );
    }

    /* ===== Discard unsaved weekly schedule changes ===== */
    function discardScheduleChanges() {
        clearPreviousError();
        setScheduleRows(initialSchedule);
    }

    /* ===== Check whether a schedule row is newly added ===== */
    function isNewScheduleRow(rowId: string) {
        return !initialSchedule.some((initialRow) => initialRow.id === rowId);
    }

    //============================Return Page==========================================================//
    return (
        <form action={saveAction} className="space-y-4">
            {/* ===== Schedule values submitted to server ===== */}
            <input type="hidden" name="countryCode" value={countryCode} />

            <input
                type="hidden"
                name="scheduleJson"
                value={JSON.stringify(
                    scheduleRows.map((scheduleRow) => ({
                        day_of_week: scheduleRow.dayOfWeek,
                        start_local_time: scheduleRow.startLocalTime,
                        end_local_time: scheduleRow.endLocalTime,
                        pricing_profile_code: scheduleRow.pricingProfileCode,
                    }))
                )}
            />
            
            {/* ===== Current schedule count ===== */}
            <p className="text-sm text-slate-400">
                Current weekly schedule: <span className="font-semibold text-cyan-300">{scheduleRows.length} periods</span>
            </p>

            {/* ===== Weekly schedule actions ===== */}
            <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={formStyles.smallButton}>
                    Save schedule
                </button>

                <button type="button" onClick={discardScheduleChanges} className={formStyles.smallButton}>
                    Discard changes
                </button>
            </div>

            {/* ===== Weekly schedule save error ===== */}
            {editorError === "save-failed" && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    The weekly schedule could not be saved. Check that all seven days are covered continuously,
                    with no gaps or overlaps, and that every period uses a valid pricing profile.
                </div>
            )}

            {editorError === "missing-schedule" && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    The weekly schedule was missing from the submitted form.
                </div>
            )}

            {editorError === "invalid-schedule" && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    The submitted weekly schedule could not be read.
                </div>
            )}

            {/* ===== Unsaved schedule warning ===== */}
            {hasUnsavedChanges && (
                <div className="rounded-md border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
                    <p className="font-semibold text-yellow-300">Unsaved changes</p>
                    <p className="mt-1">
                        Your changes are only in the editor. Click Save schedule to store them.
                        If you leave or refresh this page, the changes will be lost.
                    </p>
                </div>
            )}
            {/* ===== Weekly schedule grouped by day ===== */}
            <div className="space-y-4">

                {/* ===== Editor information ===== */}
                <p className="text-sm text-slate-400">
                    Editing recurring weekly pricing schedule for <span className="font-semibold text-cyan-300">{countryCode}</span>.
                    Holidays and special events are configured separately.
                </p>

                {scheduleRowsByDay.map((scheduleDay) => (
                    <div
                        key={scheduleDay.dayOfWeek}
                        className="rounded-xl border border-cyan-400/20 bg-slate-950/40 p-3"
                    >
                        {/* ===== Day heading and action ===== */}
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="font-semibold text-cyan-300">
                                {scheduleDay.dayName}
                            </h3>

                            <button
                                type="button"
                                onClick={() => addScheduleRow(scheduleDay.dayOfWeek)}
                                className={formStyles.smallButton}
                            >
                                + Add period
                            </button>
                        </div>

                        {/* ===== No periods for day ===== */}
                        {scheduleDay.periods.length === 0 ? (
                            <p className="text-sm text-yellow-300">
                                No pricing periods configured for this day.
                            </p>
                        ) : (
                            /* ===== Editable pricing periods ===== */
                            <div className="grid gap-3 xl:grid-cols-3">
                                {scheduleDay.periods.map((scheduleRow) => (
                                    <div
                                        key={scheduleRow.id}
                                        className={`rounded-lg border p-3 ${
                                            isNewScheduleRow(scheduleRow.id)
                                                ? "border-yellow-400/70 bg-yellow-400/10 ring-1 ring-yellow-400/30"
                                                : "border-cyan-400/20 bg-slate-900/60"
                                        }`}
                                    >
                                        {/* ===== New period indicator ===== */}
                                        {isNewScheduleRow(scheduleRow.id) && (
                                            <div className="mb-2">
                                                <span className="rounded bg-yellow-400/20 px-2 py-0.5 text-xs font-semibold text-yellow-300">
                                                    New
                                                </span>
                                            </div>
                                        )}

                                        {/* ===== Pricing profile ===== */}
                                        <div>
                                            <label className="text-xs text-slate-400">Pricing profile</label>
                                            <select
                                                value={scheduleRow.pricingProfileCode}
                                                onChange={(event) =>
                                                    updateScheduleRow(
                                                        scheduleRow.id,
                                                        "pricingProfileCode",
                                                        event.target.value
                                                    )
                                                }
                                                className={formStyles.selectWFull}
                                            >
                                                {pricingProfileOptions.map((profileOption) => (
                                                    <option
                                                        key={profileOption.pricingProfileCode}
                                                        value={profileOption.pricingProfileCode}
                                                    >
                                                        {profileOption.pricingProfileName} ({profileOption.pricingProfileCode})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* ===== Time period ===== */}
                                        <div className="mt-3 grid grid-cols-2 gap-3">

                                            {/* ===== Start time ===== */}
                                            <div>
                                                <label className="text-xs text-slate-400">From</label>
                                                <input
                                                    type="time"
                                                    value={scheduleRow.startLocalTime}
                                                    className={formStyles.inputWFullCyan}
                                                    onChange={(event) =>
                                                        updateScheduleRow(
                                                            scheduleRow.id,
                                                            "startLocalTime",
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </div>

                                            {/* ===== End time ===== */}
                                            <div>
                                                <label className="text-xs text-slate-400">Until</label>

                                                {scheduleRow.endLocalTime === "24:00" ? (
                                                    <div className="space-y-2">
                                                        <div className={`${formStyles.inputWFullCyan} flex items-center`}>
                                                            24:00
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateScheduleRow(
                                                                    scheduleRow.id,
                                                                    "endLocalTime",
                                                                    "23:00"
                                                                )
                                                            }
                                                            className={formStyles.smallButton}
                                                        >
                                                            Choose time
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <input
                                                            type="time"
                                                            value={scheduleRow.endLocalTime}
                                                            className={formStyles.inputWFullCyan}
                                                            onChange={(event) =>
                                                                updateScheduleRow(
                                                                    scheduleRow.id,
                                                                    "endLocalTime",
                                                                    event.target.value
                                                                )
                                                            }
                                                        />

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateScheduleRow(
                                                                    scheduleRow.id,
                                                                    "endLocalTime",
                                                                    "24:00"
                                                                )
                                                            }
                                                            className={formStyles.smallButton}
                                                        >
                                                            End of day
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* ===== Remove period ===== */}
                                        <div className="mt-3 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => removeScheduleRow(scheduleRow.id)}
                                                className={formStyles.deActiveDeleteButton}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </form>
);

}
"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";
import { formatShortDate, formatShortTime } from "@/lib/formatDateTime";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

type OpenBooking = {
  id: string;
  pickupCity: string | null;
  destinationCity: string | null;
  pickupDate: string;
  pickupTime: string;
  estimatedDurationMinutes: number | null;
  passengers: number;
  luggage: number;
  tripType: string;
  hasPets: boolean;
  infantSeatCountRequired: number;
  childSeatCountRequired: number;
  boosterSeatCountRequired: number;
  isofixRequired: boolean;
  wheelchairRequirement: string;
  wheelchairPassengerCount: number;
  mobilityAidStorageRequired: boolean;
  extraLargeLuggageRequired: boolean;
};

type DefaultVehicle = {
  id: string;
  brand: string;
  model: string;
  licensePlate: string;
};

type OpenBookingsResponse = {
  message?: string;
  defaultVehicle?: DefaultVehicle;
  bookings?: OpenBooking[];
};

type ClaimBookingResponse = {
  message?: string;
  claim?: {
    bookingId: string;
    chauffeurId: string;
    vehicleId: string;
    status: string;
  };
};

/*
  OpenBookingsList loads privacy-safe booking information and
  allows the logged-in chauffeur to claim one booking.

  The browser sends only the booking ID.

  PostgreSQL determines:
  - the authenticated chauffeur;
  - the default vehicle;
  - whether the booking is still available;
  - whether the chauffeur and vehicle match the booking.
*/
export default function OpenBookingsList() {
  const { languageCode } = useLanguage();

  const [defaultVehicle, setDefaultVehicle] = useState<DefaultVehicle | null>(null);

  const [bookings, setBookings] = useState<OpenBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [claimingBookingId, setClaimingBookingId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  /*
    Returns translated open-bookings text.

    useCallback keeps the function stable until the selected
    language changes.
  */
  const getOpenBookingsText = useCallback(
    (textKey: string) =>
      getTranslation("chauffeurOpenBookingsPage", textKey, languageCode),
    [languageCode]
  );

  /*
    Reuses shared chauffeur-dashboard translations for booking
    and passenger-support labels.
  */
  function getDashboardText(textKey: string) {
    return getTranslation("chauffeurDashboardPage", textKey, languageCode);
  }

  /*
    Converts a database trip-type value into translated text.
  */
  function getTripTypeLabel(tripTypeValue: string) {
    const translationKeys: Record<string, string> = {
      "one-way": "tripTypeOneWay",
      one_way: "tripTypeOneWay",
      return: "tripTypeReturn",
      airport: "tripTypeAirport",
      business: "tripTypeBusiness",
      hourly: "tripTypeHourly",
    };

    const translationKey = translationKeys[tripTypeValue];

    return translationKey
      ? getDashboardText(translationKey)
      : tripTypeValue;
  }

  /*
    Converts a wheelchair requirement into translated text.
  */
  function getWheelchairRequirementLabel(requirementValue: string) {
    const translationKeys: Record<string, string> = {
      none: "wheelchairNone",
      foldable: "wheelchairFoldableOnly",
      remain_in_wheelchair: "wheelchairRemainSeated",
    };

    const translationKey = translationKeys[requirementValue];

    return translationKey
      ? getDashboardText(translationKey)
      : requirementValue;
  }

  /*
    Loads the current chauffeur's available default vehicle and
    privacy-safe open bookings.
  */
  useEffect(() => {
    const controller = new AbortController();

    async function loadOpenBookings() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          "/api/chauffeur/open-bookings",
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result = (await response.json()) as OpenBookingsResponse;

        if (!response.ok) { throw new Error( result.message || getOpenBookingsText("loadFailedError"));}

        setDefaultVehicle(result.defaultVehicle ?? null);
        setBookings(result.bookings ?? []);
      }
      catch (error) {
        if ( error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Could not load open bookings:", error);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : getOpenBookingsText("loadFailedError")
        );
    }
      finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadOpenBookings();

    return () => controller.abort();
  }, [getOpenBookingsText]);

  /*
    Claims one booking through the authenticated claim API.

    After a successful claim, the booking is removed from the
    visible open-bookings list.
  */
  async function handleClaimBooking(bookingId: string) {
    setClaimingBookingId(bookingId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/chauffeur/open-bookings/claim",
        {
          method: "POST",
          headers: {"Content-Type": "application/json",},
          body: JSON.stringify({ bookingId }),
        }
      );

      const result =  (await response.json()) as ClaimBookingResponse;

        if (!response.ok) {
        setErrorMessage(
            result.message ||
            getOpenBookingsText("claimFailedError")
        );

        return;
        }

      setBookings((currentBookings) =>currentBookings.filter((booking) => booking.id !== bookingId));
      setSuccessMessage(getOpenBookingsText("claimSuccess"));
    }
    catch (error) {
        console.error("Could not claim booking:", error);

        setErrorMessage(
            error instanceof Error
            ? error.message
            : getOpenBookingsText("claimFailedError")
        );
    }
    finally {setClaimingBookingId(null);}
  }

  return (
    <section className="mt-8">
      {defaultVehicle && (
        <div className={formStyles.info}>
          <p className="font-semibold text-cyan-300">
            {getOpenBookingsText("defaultVehicleTitle")}
          </p>

          <p className="mt-2 technical-value text-white">
            {defaultVehicle.brand} {defaultVehicle.model}
            {" — "}
            {defaultVehicle.licensePlate}
          </p>
        </div>
      )}

      {successMessage && (<p className={pageStyles.successMsgPage}>{successMessage}</p>)}
      {errorMessage && (<p className={pageStyles.errorMsgPage}>{errorMessage}</p> )}
      {isLoading && (<p className="mt-8 text-slate-300">{getOpenBookingsText("loadingMessage")}</p>)}
      {!isLoading && !errorMessage && bookings.length === 0 && (
          <div className={`${tableStyles.cellEmpty} mt-8`}>
            {getOpenBookingsText("noBookingsMessage")}
          </div>
        )}

      {!isLoading && bookings.length > 0 && (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {bookings.map((booking) => {
            const isClaiming = claimingBookingId === booking.id;

            return (
              <article key={booking.id} className={`${formStyles.info} grid gap-5`}>
                <div className="grid gap-3">
                  {/* Keep both city fields together in their own grid. */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getOpenBookingsText("pickupCityLabel")}:{" "}
                      </span>

                      <span className="technical-value">
                        {booking.pickupCity || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getOpenBookingsText("destinationCityLabel")}:{" "}
                      </span>

                      <span className="technical-value">
                        {booking.destinationCity || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Other booking details use a separate grid. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("dateLabel")}:{" "}
                      </span>

                      <span className="technical-value">
                        {formatShortDate(booking.pickupDate)}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("timeLabel")}:{" "}
                      </span>

                      <span className="technical-value">
                        {formatShortTime(booking.pickupTime)}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("passengersLabel")}:{" "}
                      </span>

                      <span>{booking.passengers}</span>
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("luggageLabel")}:{" "}
                      </span>

                      <span>{booking.luggage}</span>
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("tripTypeLabel")}:{" "}
                      </span>

                      <span>
                        {getTripTypeLabel(booking.tripType)}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("hasPetsLabel")}:{" "}
                      </span>

                      <span className={
                          booking.hasPets
                            ? tableStyles.cellGreenText
                            : tableStyles.cellRedText
                        }>
                        {booking.hasPets
                          ? getDashboardText("yes")
                          : getDashboardText("no")}
                      </span>
                    </div>

                    <div className="col-span-2">
                      <span className="font-semibold text-cyan-300">
                        {getOpenBookingsText("estimatedDurationLabel")}:{" "}
                      </span>

                      <span>
                        {booking.estimatedDurationMinutes ?? "—"}{" "}
                        {getOpenBookingsText("minutesUnit")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <p className="font-semibold text-white">
                    {getDashboardText("passengerSupportTitle")}
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("infantSeatsLabel")}:{" "}
                      </span>

                      {booking.infantSeatCountRequired}
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("childSeatsLabel")}:{" "}
                      </span>

                      {booking.childSeatCountRequired}
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("boosterSeatsLabel")}:{" "}
                      </span>

                      {booking.boosterSeatCountRequired}
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("isofixLabel")}:{" "}
                      </span>

                      {booking.isofixRequired
                        ? getDashboardText("yes")
                        : getDashboardText("no")}
                    </div>

                    <div className="sm:col-span-2">
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("wheelchairRequirementLabel")}:{" "}
                      </span>

                      {getWheelchairRequirementLabel(
                        booking.wheelchairRequirement
                      )}
                    </div>

                    {booking.wheelchairRequirement ===
                      "remain_in_wheelchair" && (
                      <div>
                        <span className="font-semibold text-cyan-300">
                          {getDashboardText("wheelchairPassengerCountLabel")}:{" "}
                        </span>

                        {booking.wheelchairPassengerCount}
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("mobilityAidStorageLabel")}:{" "}
                      </span>

                      {booking.mobilityAidStorageRequired
                        ? getDashboardText("yes")
                        : getDashboardText("no")}
                    </div>

                    <div>
                      <span className="font-semibold text-cyan-300">
                        {getDashboardText("extraLargeLuggageLabel")}:{" "}
                      </span>

                      {booking.extraLargeLuggageRequired
                        ? getDashboardText("yes")
                        : getDashboardText("no")}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={claimingBookingId !== null}
                  onClick={() => void handleClaimBooking(booking.id)}
                  className={formStyles.primaryButtonOutside}>
                  {isClaiming
                    ? getOpenBookingsText("claimingButton")
                    : getOpenBookingsText("claimButton")}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
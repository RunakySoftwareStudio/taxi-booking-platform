/* =========================================================================================
   FILE PURPOSE: VEHICLE MATCHING

   This file compares one booking's passenger requirements with one vehicle's capabilities.

   It checks:
   - normal passenger seats;
   - luggage capacity;
   - infant, child and booster seats;
   - ISOFIX availability;
   - wheelchair transport and wheelchair capacity;
   - mobility-aid storage;
   - extra-large luggage support.

   The result contains:
   - matches: TRUE when every requirement is supported;
   - reasons: explanations of the requirements the vehicle cannot support.

   Keeping these rules in one central file prevents different pages from using different
   matching logic.
========================================================================================= */
import type { WheelchairRequirement } from "@/types/wheelchairRequirementType";

export type VehicleWheelchairAccess = "none" | "foldable_only" | "ramp" | "lift";

export type VehicleForMatching = {
    seats: number; luggageCapacity: number;
    infantSeatCount: number; childSeatCount: number; boosterSeatCount: number;
    isofixAvailable: boolean;
    wheelchairAccess: VehicleWheelchairAccess; wheelchairCapacity: number;
    mobilityAidStorage: boolean; extraLargeLuggage: boolean;
};

export type BookingForMatching = {
    passengers: number; luggage: number;
    infantSeatCountRequired: number; childSeatCountRequired: number; boosterSeatCountRequired: number;
    isofixRequired: boolean;
    wheelchairRequirement: WheelchairRequirement; wheelchairPassengerCount: number;
    mobilityAidStorageRequired: boolean; extraLargeLuggageRequired: boolean;
};

export type VehicleMatchResult = { matches: boolean; reasons: string[]; };

/*
  Compares one booking with one vehicle.
  Wheelchair passengers who remain seated do not need normal seats.
*/
export function getVehicleMatchResult( vehicleValue: VehicleForMatching, bookingValue: BookingForMatching): VehicleMatchResult {
    const reasons: string[] = [];
    const normalSeatsRequired = Math.max( 0, bookingValue.passengers - bookingValue.wheelchairPassengerCount );
    if (vehicleValue.seats < normalSeatsRequired) {
        reasons.push(`Requires ${normalSeatsRequired} normal passenger seats.`);
    }

    if (vehicleValue.luggageCapacity < bookingValue.luggage) {
        reasons.push(`Requires luggage capacity for ${bookingValue.luggage} items.`);
    }

    if (vehicleValue.infantSeatCount < bookingValue.infantSeatCountRequired) {
        reasons.push(`Requires ${bookingValue.infantSeatCountRequired} infant seats.`);
    }

    if (vehicleValue.childSeatCount < bookingValue.childSeatCountRequired) {
        reasons.push(`Requires ${bookingValue.childSeatCountRequired} child seats.`);
    }

    if (vehicleValue.boosterSeatCount < bookingValue.boosterSeatCountRequired) {
        reasons.push(`Requires ${bookingValue.boosterSeatCountRequired} booster seats.`);
    }

    if (bookingValue.isofixRequired && !vehicleValue.isofixAvailable) {
        reasons.push("Requires ISOFIX.");
    }

    if (
        bookingValue.wheelchairRequirement === "foldable" &&
        vehicleValue.wheelchairAccess === "none"
    ) {
        reasons.push("Requires support for a foldable wheelchair.");
    }

    if (bookingValue.wheelchairRequirement === "remain_in_wheelchair") {
        const hasRampOrLift =
            vehicleValue.wheelchairAccess === "ramp" ||
            vehicleValue.wheelchairAccess === "lift";

        if (!hasRampOrLift) {
            reasons.push("Requires wheelchair access by ramp or lift.");
        }

        if (vehicleValue.wheelchairCapacity < bookingValue.wheelchairPassengerCount) {
            reasons.push(`Requires capacity for ${bookingValue.wheelchairPassengerCount} wheelchair passengers.`);
        }
    }

    if (bookingValue.mobilityAidStorageRequired && !vehicleValue.mobilityAidStorage) {
        reasons.push("Requires mobility-aid storage.");
    }

    if (bookingValue.extraLargeLuggageRequired && !vehicleValue.extraLargeLuggage) {
        reasons.push("Requires support for extra-large luggage.");
    }

    /* Returns true only when no missing requirements were found. */
    return { matches: reasons.length === 0, reasons };
}
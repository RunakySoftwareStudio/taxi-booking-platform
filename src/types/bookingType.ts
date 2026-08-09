
import { type BookingStatus } from "@/types/bookingStatusType";
import type { MapboxCoordinate } from "@/types/mapboxType";
import { type WheelchairRequirement } from "@/types/wheelchairRequirementType";

export type BookingRequest = {
    pickup: string;
    pickupCity: string;
    destination: string;
    destinationCity: string;
    pickupCoordinate: MapboxCoordinate;
    destinationCoordinate: MapboxCoordinate;
    date: string;
    time: string;
    estimatedDurationMinutes: string;
    passengers: string;
    luggage: string;
    name: string;
    phone: string;
    email: string;
    tripType: string;
    notes: string;
    status: BookingStatus;
    hasPets: boolean;
    infantSeatCountRequired: string;
    childSeatCountRequired: string;
    boosterSeatCountRequired: string;
    isofixRequired: boolean;
    wheelchairRequirement: WheelchairRequirement;
    wheelchairPassengerCount: string;
    mobilityAidStorageRequired: boolean;
    extraLargeLuggageRequired: boolean;
};

/**
 * Purpose:
 * Represents the final request sent when the customer
 * confirms the reviewed booking.
 *
 * At this stage a temporary journey quote already exists,
 * so its quote ID becomes a required part of confirmation.
 *
 * BookingRequest
 *      +
 * journeyQuoteId
 *      ↓
 * BookingConfirmationRequest
 */
export type BookingConfirmationRequest = BookingRequest & {
    journeyQuoteId: string;
};
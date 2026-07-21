
import { type BookingStatus } from "@/types/bookingStatusType";
import type { MapboxCoordinate } from "@/types/mapboxType";
import { type WheelchairRequirement } from "@/types/wheelchairRequirementType";

export type BookingRequest = {
    pickup: string;
    destination: string;
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
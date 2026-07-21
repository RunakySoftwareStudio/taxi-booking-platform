import type { BookingStatus } from "./bookingStatusType";
import type { WheelchairRequirement } from "./wheelchairRequirementType";

export type BookingSummary = {
    id: string;

    pickup: string;
    destination: string;
    date: string;
    time: string;
    estimatedDurationMinutes: number;

    passengers: number;
    luggage: number | null;

    name: string;
    phone: string;
    email: string;

    hasPets: boolean;
    infantSeatCountRequired: number;
    childSeatCountRequired: number;
    boosterSeatCountRequired: number;
    isofixRequired: boolean;
    wheelchairRequirement: WheelchairRequirement;
    wheelchairPassengerCount: number;
    mobilityAidStorageRequired: boolean;
    extraLargeLuggageRequired: boolean;
    
    tripType: string;
    notes: string | null;
    status: BookingStatus;
    
};
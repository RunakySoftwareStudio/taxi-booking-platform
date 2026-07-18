import type { BookingStatus } from "./bookingStatusType";

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
    tripType: string;
    notes: string | null;
    status: BookingStatus;
    
};
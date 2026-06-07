
/*============================================================
1. HTML/browser validation in BookingForm.tsx
2. Server validation in validateBooking.ts
==============================================================*/
import { type BookingRequest } from "@/types/bookingType";

export type BookingValidationResult = | { isValid: true;}  | { isValid: false;  message: string; };

export function validateBookingRequest( bookingInput: BookingRequest): BookingValidationResult 
{
    if (!bookingInput.pickup.trim()) { 
        return {    
            isValid: false,
            message: "Pickup location is required." 
        };
    }

    if (!bookingInput.destination.trim()) {
        return {
            isValid: false,
            message: "Destination is required.",
        };
    }

    if (!bookingInput.date) {
        return {
            isValid: false,
            message: "Pickup date is required.",
        };
    }

    if (!bookingInput.time) {
        return {
            isValid: false,
            message: "Pickup time is required.",
        };
    }

    if (!bookingInput.name.trim()) {
        return {
            isValid: false,
            message: "Client name is required.",
        };
    }

    if (!bookingInput.email.trim()) {
        return {
            isValid: false,
            message: "Client email is required.",
        };
    }

    if (!bookingInput.phone.trim()) {
        return {
            isValid: false,
            message: "Client phone is required.",
        };
    }

    if (!bookingInput.tripType.trim()) {
        return {
            isValid: false,
            message: "Trip type is required.",
        };
    }

    const passengerCount = Number(bookingInput.passengers);

    if (!Number.isInteger(passengerCount) || passengerCount < 1) {
        return {
            isValid: false,
            message: "Passengers must be at least 1.",
        };
    }

    const luggageCount = Number(bookingInput.luggage || 0);

    if (!Number.isInteger(luggageCount) || luggageCount < 0) {
        return {
            isValid: false,
            message: "Luggage cannot be negative.",
        };
    }

    return { isValid: true };
}
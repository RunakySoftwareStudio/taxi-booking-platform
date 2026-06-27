
import { type BookingStatus } from "@/types/bookingStatusType";

export type BookingRequest = {
  pickup: string;
  destination: string;
  date: string;
  time: string;
  passengers: string;
  luggage: string;
  name: string;
  phone: string;
  email: string;
  tripType: string;
  notes: string;
  status: BookingStatus;
  hasPets: boolean;
};
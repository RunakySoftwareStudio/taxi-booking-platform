import { type TripType } from "@/types/tripTypeType";

export const tripTypes: TripType[] = [
  {
    value: "one-way",
    label: "One-way trip",
  },
  {
    value: "return",
    label: "Return trip",
  },
  {
    value: "airport",
    label: "Airport transfer",
  },
  {
    value: "business",
    label: "Business trip",
  },
  {
    value: "hourly",
    label: "Hourly chauffeur",
  },
];
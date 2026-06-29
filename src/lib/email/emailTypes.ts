export type BookingEmailData = {
    id: string;
    name: string;
    email: string;
    phone: string;
    pickup: string;
    destination: string;
    date: string;
    time: string;
    passengers: string;
    luggage: string;
    tripType: string;
    status: string;
    hasPets: boolean;
    notes: string;
};

export type EmailContent = {
    subject: string;
    text: string;
    html: string;
};
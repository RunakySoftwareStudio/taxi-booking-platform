/*
export function formatShortDate(dateValue: string | null | undefined) {
  if (!dateValue) {return "-"; }

  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) {   return dateValue;  }

  return `${day}/${month}/${year.slice(2)}`;
}

export function formatShortTime(timeValue: string | null | undefined) {
  if (!timeValue) {  return "-";  }

  return timeValue.slice(0, 5);
}*/
// format date as dd/mm/yy
export function formatShortDate(dateValue: string | null | undefined) {
  if (!dateValue) { return "-"; }
  const datePart = dateValue.slice(0, 10);
  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) {  return dateValue; }
  return `${day}/${month}/${year.slice(2)}`;
}

// Format the time as hh:mm
export function formatShortTime(timeValue: string | null | undefined) {
  if (!timeValue) {return "-"; }
  return timeValue.slice(0, 5);
}

// for values like created at that has date and time in it
export function formatShortDateTime(dateTimeValue: string | null | undefined) {
  if (!dateTimeValue) {  return "-";  }

  const datePart = dateTimeValue.slice(0, 10);
  const timePart = dateTimeValue.slice(11, 16);
  const shortDate = formatShortDate(datePart);

  if (!timePart) {  return shortDate;  }
  return `${shortDate} ${timePart}`;
}

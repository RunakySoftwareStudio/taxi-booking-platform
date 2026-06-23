export function formatShortDate(dateValue: string | null | undefined) {
  if (!dateValue) {return "-"; }

  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) {   return dateValue;  }

  return `${day}/${month}/${year.slice(2)}`;
}

export function formatShortTime(timeValue: string | null | undefined) {
  if (!timeValue) {  return "-";  }

  return timeValue.slice(0, 5);
}
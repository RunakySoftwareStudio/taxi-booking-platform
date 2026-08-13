/*
 * Pricing Version - Process 3
 *
 * Adds automatic updated_at handling for the two
 * pricing-schedule tables in the live database.
 */

CREATE TRIGGER update_pricing_schedules_updated_at
BEFORE UPDATE ON public.pricing_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE TRIGGER update_pricing_schedule_overrides_updated_at
BEFORE UPDATE ON public.pricing_schedule_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
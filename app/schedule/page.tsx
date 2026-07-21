import { buildScheduleEvents } from "@/lib/schedule";
import { allSellers, allObligors } from "@/lib/data/store";
import ScheduleCalendar from "./ScheduleCalendar";

export const dynamic = "force-dynamic";

export default function SchedulePage() {
  const events = buildScheduleEvents();
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));
  const defaultMonth = new Date().toISOString().slice(0, 7);

  return (
    <>
      <h1 className="page-title">Reservation Schedule</h1>
      <p className="page-sub">
        Forward calendar of exposure events — expected fundings, swingline
        movements, and repayments. Filter by one or more sellers and/or obligors
        to focus a set of clients for the month.
      </p>
      <ScheduleCalendar
        events={events}
        sellers={sellers}
        obligors={obligors}
        defaultMonth={defaultMonth}
      />
    </>
  );
}

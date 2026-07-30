import { buildScheduleEvents } from "@/lib/schedule";
import { allSellers, allObligors } from "@/lib/data/store";
import { expectedOutstandingByDate } from "@/lib/projection";
import ScheduleCalendar from "./ScheduleCalendar";

export const dynamic = "force-dynamic";

export default function SchedulePage() {
  const events = buildScheduleEvents();
  const sellers = allSellers().map((s) => ({ id: s.id, name: s.name }));
  const obligors = allObligors().map((o) => ({ id: o.id, name: o.name }));
  const defaultMonth = new Date().toISOString().slice(0, 7);
  // Expected outstanding for calendar cells — from ~6 weeks back through ~11
  // months forward, covering reasonable month navigation.
  const projStart = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 45); return d.toISOString().slice(0, 10); })();
  const outstandingByDate = expectedOutstandingByDate(projStart, 400);

  return (
    <>
      <h1 className="page-title">Reservation Schedule</h1>
      <p className="page-sub">
        Forward calendar of exposure events — expected fundings, swingline
        movements, and repayments — with the expected outstanding (funded
        principal) projected on each day from live bookings and future
        reservations. Filter by one or more sellers and/or obligors to focus a
        set of clients for the month.
      </p>
      <ScheduleCalendar
        events={events}
        sellers={sellers}
        obligors={obligors}
        defaultMonth={defaultMonth}
        outstandingByDate={outstandingByDate}
      />
    </>
  );
}

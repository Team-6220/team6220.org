// Demo data for the Calendar: about three months of meetings around today, with shifts, a competition, a break and
// a few subteam meetings, so every screen has something to show in demo mode.
import { seedMock } from "../ops/mock";
import { addDays, eachDay, today, weekday } from "./dates";
import type { CalEvent, Shift } from "./types";

const NAMES = ["Alex Parker", "Jordan Rivera-Nakamura", "Sam Torres", "Casey Montgomery", "Robin Lee"];

seedMock((db) => {
  const now = today();
  const event = (e: Partial<CalEvent> & Pick<CalEvent, "type" | "startDate">) =>
    db.save<CalEvent>("cal_events", { title: "", endDate: e.startDate, startTime: "", endTime: "", location: "Workshop", notes: "", mandatory: false, subteams: [], public: true, cancelled: false, ...e });
  const breakStart = addDays(now, 12 - weekday(now)); // a Thursday-Friday break about two weeks out
  event({ type: "break", title: "Thanksgiving break", startDate: breakStart, endDate: addDays(breakStart, 1), location: "" });
  const compDay = addDays(now, 27 - weekday(now)); // a Saturday-Sunday competition about four weeks out
  event({ type: "competition", title: "Beach Blitz", startDate: compDay, endDate: addDays(compDay, 1), setupDate: addDays(compDay, -1), location: "Capistrano Valley High School", startTime: "07:45", endTime: "18:00" });
  let n = 0;
  for (const day of eachDay(addDays(now, -35), addDays(now, 60))) {
    const wd = weekday(day);
    if (![2, 5, 6].includes(wd) || (day >= breakStart && day <= addDays(breakStart, 1)) || day === compDay) continue;
    const sat = wd === 6;
    const meeting = event({
      type: "meeting",
      startDate: day,
      startTime: sat ? "10:00" : "15:20",
      endTime: sat ? "14:00" : "17:00",
      mandatory: sat && n % 2 === 0,
      subteams: wd === 2 && n % 3 === 1 ? ["Programming", "Electrical"] : sat && n % 5 === 3 ? ["Manufacturing"] : [],
      notes: sat ? "Wear closed-toe shoes. Pizza at noon." : "",
    });
    const slots = sat ? [["10:00", "12:00"], ["12:00", "14:00"]] : [["15:20", "17:00"]];
    slots.forEach(([start, end], i) => {
      const taken = day < now || (n + i) % 3 !== 0;
      const mine = !taken ? false : (n + i) % 7 === 2;
      db.save<Shift>("cal_shifts", {
        eventId: meeting._id, start, end,
        memberId: mine ? "demo-supervisor" : "",
        name: mine ? "Demo Supervisor" : taken ? NAMES[(n + i) % NAMES.length] : "",
        signedUpAt: taken ? `${addDays(day, -7)}T18:00:00Z` : "",
      });
    });
    n++;
  }
});

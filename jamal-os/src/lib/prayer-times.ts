// Birmingham prayer times: static monthly fallback timetable.
// Approximate mid-month values, adequate for day planning. Upgrade path:
// swap in the adhan npm package for calculated times (documented in
// DECISIONS.md). Times are local UK clock time including DST.

export interface PrayerTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

const BIRMINGHAM_BY_MONTH: Record<number, PrayerTimes> = {
  1: { fajr: "06:25", dhuhr: "12:25", asr: "14:30", maghrib: "16:30", isha: "18:10" },
  2: { fajr: "05:55", dhuhr: "12:25", asr: "15:10", maghrib: "17:25", isha: "18:55" },
  3: { fajr: "05:05", dhuhr: "12:20", asr: "15:50", maghrib: "18:15", isha: "19:40" },
  4: { fajr: "04:55", dhuhr: "13:15", asr: "17:30", maghrib: "20:10", isha: "21:35" },
  5: { fajr: "03:50", dhuhr: "13:10", asr: "18:15", maghrib: "21:00", isha: "22:30" },
  6: { fajr: "03:10", dhuhr: "13:15", asr: "18:40", maghrib: "21:35", isha: "23:00" },
  7: { fajr: "03:30", dhuhr: "13:20", asr: "18:35", maghrib: "21:25", isha: "22:50" },
  8: { fajr: "04:30", dhuhr: "13:15", asr: "17:55", maghrib: "20:30", isha: "21:55" },
  9: { fajr: "05:20", dhuhr: "13:05", asr: "16:55", maghrib: "19:25", isha: "20:50" },
  10: { fajr: "06:05", dhuhr: "12:55", asr: "15:55", maghrib: "18:15", isha: "19:45" },
  11: { fajr: "06:00", dhuhr: "11:55", asr: "14:25", maghrib: "16:20", isha: "17:55" },
  12: { fajr: "06:25", dhuhr: "12:10", asr: "14:05", maghrib: "15:55", isha: "17:35" },
};

export function getBirminghamPrayerTimes(date: Date = new Date()): PrayerTimes {
  return BIRMINGHAM_BY_MONTH[date.getMonth() + 1];
}

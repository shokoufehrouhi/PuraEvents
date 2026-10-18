import umalqura from '@umalqura/core';
import dayjs, { type Dayjs } from 'dayjs';
import { jalaaliToDateObject, toJalaali } from 'jalaali-js';

import type { CalendarSystem } from '../storage/preferences';

export const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const ISLAMIC_MONTHS = [
  'محرم',
  'صفر',
  'ربیع‌الاول',
  'ربیع‌الثانی',
  'جمادی‌الاول',
  'جمادی‌الثانی',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذوالقعده',
  'ذوالحجه',
];

/** Persian weekday initials, indexed by JS `Date#getDay()` (0=Sun .. 6=Sat). */
export const PERSIAN_WEEKDAYS_BY_JS_DAY = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

/** Arabic weekday initials (الأحد..السبت), indexed by JS `Date#getDay()` (0=Sun .. 6=Sat). */
export const ARABIC_WEEKDAYS_BY_JS_DAY = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

// Gregorian month/weekday names, per supported UI language — hardcoded
// rather than generated at runtime via Intl.DateTimeFormat: that produced
// wrong output on-device (React Native's Hermes engine's Intl support is
// unreliable here, verified — a plain Node.js check of the exact same code
// gave correct results, but the on-device picker showed the wrong month
// entirely), so a static table is the safe choice, same as the hardcoded
// PERSIAN_MONTHS/ISLAMIC_MONTHS above. Farsi/Arabic reuse the weekday
// arrays above since weekday names aren't calendar-specific.
export const GREGORIAN_MONTHS_BY_LANGUAGE: Record<string, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  fa: ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

/** Indexed by JS `Date#getDay()` (0=Sun .. 6=Sat). */
export const GREGORIAN_WEEKDAYS_BY_LANGUAGE: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  tr: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  fa: PERSIAN_WEEKDAYS_BY_JS_DAY,
  ar: ARABIC_WEEKDAYS_BY_JS_DAY,
};

// Readable weekday names for a date line ("Fri, May 15") — distinct from
// the single-initial GREGORIAN_WEEKDAYS_BY_LANGUAGE above (which is only
// for the calendar grid's 7-column header row). Day-of-week is calendar
// system-independent (the same actual date is always the same weekday
// regardless of whether it's labeled via Gregorian/Persian/Islamic month
// names), so this is keyed by UI language only. Hardcoded per the same
// on-device Intl.DateTimeFormat unreliability noted above for
// GREGORIAN_MONTHS_BY_LANGUAGE — don't switch this to runtime Intl.
export const WEEKDAY_NAMES_BY_LANGUAGE: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  tr: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  fa: ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'],
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

/** Localized weekday name for a given instant, e.g. "Fri" / "جمعه". */
export function formatWeekdayName(iso: string, language: string): string {
  const table = WEEKDAY_NAMES_BY_LANGUAGE[language] ?? WEEKDAY_NAMES_BY_LANGUAGE.en;
  return table[dayjs(iso).day()];
}

/**
 * Gregorian <-> Hijri via @umalqura/core (the real Umm al-Qura calendar,
 * not an arithmetic approximation) — exact and round-trip verified across a
 * 10-year span in both directions. Replaced an earlier hand-rolled tabular
 * ("Kuwaiti algorithm") conversion that was forward-only and ~1-2 days off
 * official Umm al-Qura; two attempts at hand-deriving its inverse both
 * failed with a consistent ~2-day round-trip error, so this uses a tested
 * library instead, same reasoning as jalaali-js for the Persian calendar.
 * Valid range: Hijri 1318-1500 (~Gregorian 1900-2077) — ample for a
 * countdown app.
 */
export function toHijri(date: Date): { year: number; month: number; day: number } {
  const h = umalqura(date);
  return { year: h.hy, month: h.hm, day: h.hd };
}

/** Hijri (year, month 1-indexed, day) + time-of-day -> Gregorian Date. */
export function hijriToDateObject(hy: number, hm: number, hd: number, hour = 0, minute = 0, second = 0): Date {
  return umalqura(hy, hm, hd, hour, minute, second).date;
}

/** Number of days in a given Hijri month (29 or 30, per Umm al-Qura). */
export function islamicMonthLength(hy: number, hm: number): number {
  return umalqura(hy, hm, 1).daysInMonth;
}

interface CivilDate {
  year: number;
  month: number; // 1-indexed
  day: number;
  monthName: string;
}

function toCivilDate(iso: string, calendar: CalendarSystem, language = 'en'): CivilDate {
  const date = dayjs(iso).toDate();

  if (calendar === 'persian') {
    const { jy, jm, jd } = toJalaali(date);
    return { year: jy, month: jm, day: jd, monthName: PERSIAN_MONTHS[jm - 1] };
  }

  if (calendar === 'islamic') {
    const { year, month, day } = toHijri(date);
    return { year, month, day, monthName: ISLAMIC_MONTHS[month - 1] };
  }

  const d = dayjs(iso);
  // English keeps its short "Oct"; other languages use the full names table.
  const monthName =
    language === 'en' ? d.format('MMM') : (GREGORIAN_MONTHS_BY_LANGUAGE[language] ?? GREGORIAN_MONTHS_BY_LANGUAGE.en)[d.month()];
  return { year: d.year(), month: d.month() + 1, day: d.date(), monthName };
}

// Unicode "right-to-left isolate" (U+2067 ... U+2069) around JUST the month
// name: without it, the Persian/Arabic month name's RTL direction "leaks"
// into the neutral spaces around it, and the bidi algorithm ends up
// swapping it with an adjacent number (e.g. "19 شهریور 1405" rendering as
// "19 1405 شهریور") — see UI feedback. Isolating only the RTL word (rather
// than the whole string) keeps the surrounding numbers in plain
// left-to-right order without needing to fight the bidi algorithm over the
// numbers too.
const RLI = '⁧';
const PDI = '⁩';
export function isolateRTL(s: string): string {
  return `${RLI}${s}${PDI}`;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** "10" -> "۱۰" — for numbers displayed as part of a Persian-calendar date. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** "۱۰" -> "10" — accepts Persian-Indic digits typed into a text field, strips anything else. */
export function fromPersianDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d))).replace(/[^0-9]/g, '');
}

/**
 * Whether Persian/Islamic-calendar dates should render Farsi digits
 * (۱۴۰۵) instead of Latin ones (1405) — tied to the UI *language*, not the
 * calendar system: a Shamsi or Hijri date read in English still uses Latin
 * digits, but reads Farsi digits when the app language is Farsi or Arabic.
 */
export function shouldUseFarsiDigits(language: string): boolean {
  return language === 'fa' || language === 'ar';
}

/** Numbers shown in the UI (countdowns, times) in the same digits as the
 *  dates around them: Farsi digits for fa/ar, Latin otherwise. */
export function localizeDigits(value: string | number, language: string): string {
  return shouldUseFarsiDigits(language) ? toPersianDigits(value) : String(value);
}

/** "Oct 22, 2026" / "22 Oktober 2026" / "۲۲ اکتبر ۲۰۲۶" / "۱۹ شهریور ۱۴۰۵" /
 *  "۲۷ صفر ۱۴۴۸" — month names follow the UI language for Gregorian dates
 *  too (English keeps its short "Oct 22, 2026" form). */
export function formatCivilDateFull(iso: string, calendar: CalendarSystem, language: string): string {
  const { day, monthName, year } = toCivilDate(iso, calendar, language);
  if (calendar === 'gregorian' && language === 'en') return `${monthName} ${day}, ${year}`;
  const useFarsiDigits = shouldUseFarsiDigits(language);
  const dayStr = useFarsiDigits ? toPersianDigits(day) : String(day);
  const yearStr = useFarsiDigits ? toPersianDigits(year) : String(year);
  return `${dayStr} ${calendar !== 'gregorian' || useFarsiDigits ? isolateRTL(monthName) : monthName} ${yearStr}`;
}

/** "Sep 10" / "10 September" / "۱۹ شهریور" / "۲۷ صفر" — for repeats where the year is noise. */
export function formatCivilDateMonthDay(iso: string, calendar: CalendarSystem, language: string): string {
  const { day, monthName } = toCivilDate(iso, calendar, language);
  if (calendar === 'gregorian' && language === 'en') return `${monthName} ${day}`;
  const useFarsiDigits = shouldUseFarsiDigits(language);
  const dayStr = useFarsiDigits ? toPersianDigits(day) : String(day);
  return `${dayStr} ${calendar !== 'gregorian' || useFarsiDigits ? isolateRTL(monthName) : monthName}`;
}

/** Start (00:00 on day 1) of the month `offset` months from the one
 *  `date` falls in, counted in the given calendar — a Shamsi month runs
 *  e.g. 22 Sep – 22 Oct, not 1 Oct – 31 Oct. */
export function civilMonthStart(date: Dayjs, calendar: CalendarSystem, offset = 0): Dayjs {
  if (calendar === 'gregorian') return date.startOf('month').add(offset, 'month');
  const { year, month } = toCivilDate(date.toISOString(), calendar);
  const index = year * 12 + (month - 1) + offset;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return dayjs(calendar === 'persian' ? jalaaliToDateObject(y, m, 1) : hijriToDateObject(y, m, 1));
}

/** The month's name in the given calendar ("مهر", "صفر", "October"/"Okt"…),
 *  in the UI language for Gregorian. */
export function civilMonthName(iso: string, calendar: CalendarSystem, language: string): string {
  if (calendar === 'gregorian') return (GREGORIAN_MONTHS_BY_LANGUAGE[language] ?? GREGORIAN_MONTHS_BY_LANGUAGE.en)[dayjs(iso).month()];
  return toCivilDate(iso, calendar, language).monthName;
}

/** Bare day-of-month number in the target calendar, e.g. for "every month on the 16th". */
export function civilDayOfMonth(iso: string, calendar: CalendarSystem): number {
  return toCivilDate(iso, calendar).day;
}

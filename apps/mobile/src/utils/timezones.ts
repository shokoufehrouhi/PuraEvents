// Curated list for the manual timezone picker (app/timezone-picker.tsx) —
// not the full ~420-zone IANA set (Hermes doesn't support
// `Intl.supportedValuesOf`, confirmed via an on-device check, so there's no
// runtime source to draw the full list from anyway), just a representative
// city per major zone grouped by region, the same shape iOS's own Time Zone
// setting presents. `id` is the real IANA identifier stored in
// `Preferences.manualTimezone` and passed anywhere a timezone string is
// expected elsewhere in the app.
export interface TimezoneOption {
  id: string;
  city: string;
}

export interface TimezoneGroup {
  region: string;
  zones: TimezoneOption[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    region: 'Africa',
    zones: [
      { id: 'Africa/Cairo', city: 'Cairo' },
      { id: 'Africa/Lagos', city: 'Lagos' },
      { id: 'Africa/Johannesburg', city: 'Johannesburg' },
      { id: 'Africa/Nairobi', city: 'Nairobi' },
      { id: 'Africa/Casablanca', city: 'Casablanca' },
      { id: 'Africa/Algiers', city: 'Algiers' },
      { id: 'Africa/Tunis', city: 'Tunis' },
      { id: 'Africa/Accra', city: 'Accra' },
    ],
  },
  {
    region: 'America',
    zones: [
      { id: 'America/New_York', city: 'New York' },
      { id: 'America/Chicago', city: 'Chicago' },
      { id: 'America/Denver', city: 'Denver' },
      { id: 'America/Los_Angeles', city: 'Los Angeles' },
      { id: 'America/Anchorage', city: 'Anchorage' },
      { id: 'America/Toronto', city: 'Toronto' },
      { id: 'America/Vancouver', city: 'Vancouver' },
      { id: 'America/Mexico_City', city: 'Mexico City' },
      { id: 'America/Bogota', city: 'Bogotá' },
      { id: 'America/Lima', city: 'Lima' },
      { id: 'America/Santiago', city: 'Santiago' },
      { id: 'America/Sao_Paulo', city: 'São Paulo' },
      { id: 'America/Buenos_Aires', city: 'Buenos Aires' },
    ],
  },
  {
    region: 'Asia',
    zones: [
      { id: 'Asia/Istanbul', city: 'Istanbul' },
      { id: 'Asia/Jerusalem', city: 'Jerusalem' },
      { id: 'Asia/Beirut', city: 'Beirut' },
      { id: 'Asia/Riyadh', city: 'Riyadh' },
      { id: 'Asia/Dubai', city: 'Dubai' },
      { id: 'Asia/Tehran', city: 'Tehran' },
      { id: 'Asia/Baghdad', city: 'Baghdad' },
      { id: 'Asia/Karachi', city: 'Karachi' },
      { id: 'Asia/Kolkata', city: 'Mumbai / Delhi' },
      { id: 'Asia/Dhaka', city: 'Dhaka' },
      { id: 'Asia/Bangkok', city: 'Bangkok' },
      { id: 'Asia/Jakarta', city: 'Jakarta' },
      { id: 'Asia/Singapore', city: 'Singapore' },
      { id: 'Asia/Kuala_Lumpur', city: 'Kuala Lumpur' },
      { id: 'Asia/Hong_Kong', city: 'Hong Kong' },
      { id: 'Asia/Shanghai', city: 'Shanghai' },
      { id: 'Asia/Taipei', city: 'Taipei' },
      { id: 'Asia/Seoul', city: 'Seoul' },
      { id: 'Asia/Tokyo', city: 'Tokyo' },
      { id: 'Asia/Manila', city: 'Manila' },
    ],
  },
  {
    region: 'Europe',
    zones: [
      { id: 'Europe/London', city: 'London' },
      { id: 'Europe/Dublin', city: 'Dublin' },
      { id: 'Europe/Lisbon', city: 'Lisbon' },
      { id: 'Europe/Madrid', city: 'Madrid' },
      { id: 'Europe/Paris', city: 'Paris' },
      { id: 'Europe/Amsterdam', city: 'Amsterdam' },
      { id: 'Europe/Brussels', city: 'Brussels' },
      { id: 'Europe/Berlin', city: 'Berlin' },
      { id: 'Europe/Zurich', city: 'Zurich' },
      { id: 'Europe/Rome', city: 'Rome' },
      { id: 'Europe/Vienna', city: 'Vienna' },
      { id: 'Europe/Warsaw', city: 'Warsaw' },
      { id: 'Europe/Prague', city: 'Prague' },
      { id: 'Europe/Athens', city: 'Athens' },
      { id: 'Europe/Bucharest', city: 'Bucharest' },
      { id: 'Europe/Kyiv', city: 'Kyiv' },
      { id: 'Europe/Moscow', city: 'Moscow' },
      { id: 'Europe/Stockholm', city: 'Stockholm' },
      { id: 'Europe/Helsinki', city: 'Helsinki' },
    ],
  },
  {
    region: 'Pacific & Australia',
    zones: [
      { id: 'Australia/Perth', city: 'Perth' },
      { id: 'Australia/Adelaide', city: 'Adelaide' },
      { id: 'Australia/Sydney', city: 'Sydney' },
      { id: 'Australia/Brisbane', city: 'Brisbane' },
      { id: 'Pacific/Auckland', city: 'Auckland' },
      { id: 'Pacific/Fiji', city: 'Fiji' },
      { id: 'Pacific/Honolulu', city: 'Honolulu' },
      { id: 'Pacific/Guam', city: 'Guam' },
    ],
  },
  {
    region: 'Other',
    zones: [{ id: 'UTC', city: 'UTC' }],
  },
];

export const ALL_TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap((g) => g.zones);

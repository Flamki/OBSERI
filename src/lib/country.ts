import { countryNames } from "./databuddy/country-codes";
export function isCountryCode(code: string) {
  return /^[A-Z]{2}$/.test(code) && (Object.hasOwn(countryNames, code) || code === "XK");
}
export function countryName(code: string | null | undefined) {
  if (!code || !isCountryCode(code)) return "Unknown";
  return (
    new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? countryNames[code] ?? "Unknown"
  );
}
export function countryFlag(code: string | null | undefined) {
  return code && isCountryCode(code)
    ? String.fromCodePoint(...[...code].map((char) => char.charCodeAt(0) + 127397))
    : "";
}

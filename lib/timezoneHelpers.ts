import { isValid, addDays } from "date-fns";

export const PHT_TIMEZONE = process.env.TIMEZONE || "Asia/Manila";

// Calculate PHT epoch start as UTC
const getPhtEpochStartAsUtc = (): Date => {
  try {
    const jan11970Utc = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0));
    const phtFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: PHT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "shortOffset",
    });

    const parts = phtFormatter.formatToParts(jan11970Utc);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    const targetDatePhtFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: PHT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const targetPhtDateString = targetDatePhtFormatter.format(jan11970Utc);

    const epochPhtMidnightString = `${targetPhtDateString.replace(/\//g, "-")}T00:00:00+08:00`;
    const epochPhtStartUtc = new Date(epochPhtMidnightString);

    if (!isValid(epochPhtStartUtc)) {
      console.error(
        "[getPhtEpochStartAsUtc] Failed to calculate accurate PHT epoch start.",
      );
      return new Date(Date.UTC(1970, 0, 1, -8));
    }
    return epochPhtStartUtc;
  } catch (e) {
    console.error("[getPhtEpochStartAsUtc] Error during calculation:", e);
    return new Date(Date.UTC(1970, 0, 1, -8));
  }
};

export const PHT_EPOCH_START_UTC: Date = getPhtEpochStartAsUtc();
export const STANDARD_EPOCH_UTC: Date = new Date(0); // Standard 1970-01-01T00:00:00.000Z UTC

/**
 * Get the UTC Date object corresponding to the start of a given day in PHT (Philippines Time)
 * @param date - The date to get the start of day for
 * @returns UTC Date object representing the start of that day in PHT
 */
export const getUtcForPhtStartOfDay = (date: Date): Date => {
  if (!isValid(date)) {
    console.warn("[getUtcForPhtStartOfDay] Received invalid date:", date);
    return PHT_EPOCH_START_UTC; // Fallback to calculated PHT epoch start
  }
  try {
    // Format the input date to get its year, month, and day components in PHT
    const phtDateFormatter = new Intl.DateTimeFormat("en-CA", {
      // en-CA gives reliable YYYY-MM-DD parts
      timeZone: PHT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateParts = phtDateFormatter.formatToParts(date);
    const year = dateParts.find((p) => p.type === "year")?.value;
    const month = dateParts.find((p) => p.type === "month")?.value;
    const day = dateParts.find((p) => p.type === "day")?.value;

    if (!year || !month || !day) {
      console.error(
        "[getUtcForPhtStartOfDay] Failed to extract PHT date parts for:",
        date,
      );
      throw new Error("Failed to get PHT date parts");
    }

    // Construct a Date string that explicitly defines the start of that day in PHT using its offset (+08:00).
    // Parsing this string creates a Date object whose internal timestamp represents the UTC equivalent.
    const phtDateString = `${year}-${month}-${day}T00:00:00+08:00`;
    const utcDate = new Date(phtDateString);

    if (!isValid(utcDate)) {
      console.error(
        "[getUtcForPhtStartOfDay] Invalid Date created from string:",
        phtDateString,
        "Input Date:",
        date,
      );
      return PHT_EPOCH_START_UTC; // Fallback
    }

    return utcDate;
  } catch (e) {
    console.error("[getUtcForPhtStartOfDay] Error:", e, "Input Date:", date);
    return PHT_EPOCH_START_UTC; // Fallback to calculated PHT epoch start
  }
};

/**
 * Get the UTC Date object corresponding to the start of the NEXT day in PHT (Philippines Time)
 * Useful for setting an exclusive upper bound (`lt`) in UTC for queries aiming to include activity up to
 * the end of the PHT day corresponding to the input `date`.
 * @param date - The date to get the start of the next day for
 * @returns UTC Date object representing the start of the next day in PHT
 */
export const getUtcForPhtStartOfNextDay = (date: Date): Date => {
  if (!isValid(date)) {
    console.warn("[getUtcForPhtStartOfNextDay] Received invalid date:", date);
    // Fallback to the start of the PHT day AFTER epoch day
    return getUtcForPhtStartOfDay(addDays(STANDARD_EPOCH_UTC, 1)); // Add a day to the standard epoch UTC 00:00:00Z, then find its PHT start.
  }
  // Add 1 day to the input date's UTC value to conceptually get the "next day".
  // `addDays` works on the internal timestamp.
  const nextDayFromInputUtc = addDays(date, 1);
  // Now find the start of the PHT day corresponding to that "next day".
  return getUtcForPhtStartOfDay(nextDayFromInputUtc);
};


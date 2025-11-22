import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a name string by trimming and capitalizing each word
 * @param name - The name string to format
 * @returns Formatted name string
 */
export function formatName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

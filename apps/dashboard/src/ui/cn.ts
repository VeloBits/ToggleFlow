import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class names; Tailwind-aware (later utilities win over earlier conflicting ones). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

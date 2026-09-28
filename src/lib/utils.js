import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui class-name helper: merge conditional classes, de-duplicating
// conflicting Tailwind utilities (last one wins).
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

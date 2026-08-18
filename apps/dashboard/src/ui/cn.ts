/**
 * `cn`, re-exported from the design system.
 *
 * This file stays rather than repointing every call site at
 * `@velobits-dev/ui/cn`, and the design system expects it to: this app's
 * `components.json` sets `"utils": "@/ui/cn"`, so anything a future
 * `npx shadcn add` generates here calls exactly this function. Deleting the file
 * would break the next generated primitive, and changing its signature would
 * break all of them at once.
 *
 * The implementation is `twMerge(clsx(...))` — identical to the local copy this
 * replaces, which is why no call site had to change when it moved.
 */
export { cn } from '@velobits-dev/ui/cn';

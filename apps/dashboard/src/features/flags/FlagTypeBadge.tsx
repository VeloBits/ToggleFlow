/**
 * The flag's value type, as its label from the engine's registry.
 *
 * ## Why this is plain text and not a badge
 *
 * It was an outlined pill with a per-type glyph. Both are gone, because the type
 * is not state: it is a fixed property of the definition that never changes
 * after creation, and giving it a pill put it in the same visual class as the
 * Status badge, which is the one thing in a row that people are scanning for.
 * Fifty outlined pills down a column also read as fifty buttons.
 *
 * The glyph was worse than redundant. Three words already differ at the first
 * character - Boolean, String, String (choice) - so the switch, the `T` and the
 * bulleted list were decoration that cost 15px of a column and a `Record` to
 * maintain. In the detail header, where this sits between the status badge and
 * the environment badge, unboxed muted text now reads as an annotation of the
 * flag rather than as a fourth piece of state, which is what it is.
 *
 * The name stays `FlagTypeBadge` although it no longer renders a `Badge`:
 * renaming it means editing `detail/FlagDetailHeader.tsx` too, and a rename is
 * not worth a second file in the diff.
 *
 * The label is never hardcoded: it comes from `FLAG_TYPES[type].label`, so the
 * type picker in the form, this label and any future CLI all say the same word.
 */
import { FLAG_TYPES, type FlagValueType } from '@toggleflow/engine';

import { cn } from '@/ui/cn';

export function FlagTypeBadge({
  valueType,
  className,
}: {
  valueType: FlagValueType;
  className?: string;
}) {
  // Total rather than indexed directly: a row must still render if a newer
  // control plane sends a type this build predates, and the raw type name is a
  // better answer there than a blank cell.
  const label = FLAG_TYPES[valueType]?.label ?? valueType;

  return (
    <span className={cn('text-muted-foreground text-[12.5px] whitespace-nowrap', className)}>
      {label}
    </span>
  );
}

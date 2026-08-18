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
 * ## Rose, and still not a badge
 *
 * The value type is the one axis in this product that is a pure category -
 * Boolean, String, String (choice) carry no severity and no state - and every
 * other chromatic token means a status or the brand, so before `--rose` existed
 * a categorical axis could only borrow `primary` and come out blue. This is what
 * that token is for.
 *
 * It is a tint on the existing text, NOT a return of the pill. Everything in the
 * docblock above still holds: the type is not state, and boxing it would put it
 * back in the same visual class as the Status badge. Rose measures 6.37:1 light
 * and 7.04:1 dark against a panel, so it clears AA at this 12.5px size with
 * room, which muted grey did not have to prove because nobody reads a grey
 * annotation for meaning.
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
    <span className={cn('text-rose text-[12.5px] whitespace-nowrap', className)}>
      {label}
    </span>
  );
}

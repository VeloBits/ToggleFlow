/**
 * The flag's value type, as a glyph plus its label from the engine's registry.
 *
 * The label is never hardcoded here: it comes from `FLAG_TYPES[type].label`, so
 * the type picker in the form, this badge and any future CLI all say the same
 * word. Only the icon is a dashboard concern, and it is looked up through a
 * `Record<FlagValueType, …>` so a new type is a compile error until it has one.
 */
import type { ComponentType } from 'react';

import { FLAG_TYPES, type FlagValueType } from '@toggleflow/engine';

import { Badge } from '@/components/ui/badge';
import { ListIcon, ToggleIcon, TypeIcon, type IconProps } from '@/ui/icons';
import { cn } from '@/ui/cn';

/**
 * Chosen to read apart at 12px by silhouette rather than detail: a switch is
 * horizontal, a `T` is vertical, a bulleted list is stacked.
 */
const TYPE_ICONS: Record<FlagValueType, ComponentType<IconProps>> = {
  boolean: ToggleIcon,
  string: TypeIcon,
  string_enum: ListIcon,
};

export function FlagTypeBadge({
  valueType,
  className,
}: {
  valueType: FlagValueType;
  className?: string;
}) {
  // Total rather than indexed directly: a row must still render if a newer
  // control plane sends a type this build predates.
  const Icon = TYPE_ICONS[valueType] ?? ToggleIcon;
  const label = FLAG_TYPES[valueType]?.label ?? valueType;

  return (
    <Badge variant="outline" className={cn('text-muted-foreground gap-1 font-normal', className)}>
      <Icon size={11} />
      {label}
    </Badge>
  );
}

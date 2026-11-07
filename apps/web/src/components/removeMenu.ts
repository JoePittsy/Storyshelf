import type { MoreMenuItem } from '@joepittsy/ui';

/** A Continue listening book's menu: "More for The Hobbit", holding Remove from Continue listening. */
export const removeMenu = (
  itemId: string,
  title: string,
  onRemove: (itemId: string) => void,
  busy = false
): { label: string; items: MoreMenuItem[]; busy: boolean } => ({
  label: `More for ${title}`,
  items: [{ label: 'Remove from Continue listening', onSelect: () => onRemove(itemId), disabled: busy }],
  busy,
});

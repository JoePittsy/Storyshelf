import { Dialog, PillButton } from '@joepittsy/ui';
import { ShortcutList } from './ShortcutList';

/** The keyboard shortcuts, as a small dialog: opened from the account menu, or with ? on the keyboard. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Keyboard shortcuts"
      size="sm"
      onClose={onClose}
      actions={
        <PillButton data-autofocus variant="primary" onClick={onClose}>
          Done
        </PillButton>
      }
    >
      <ShortcutList />
    </Dialog>
  );
}

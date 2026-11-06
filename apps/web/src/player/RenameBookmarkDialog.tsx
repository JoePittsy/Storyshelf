import { useState } from 'react';
import { Dialog, PillButton, TextField } from '@joepittsy/ui';

/** Longer than any chapter title, short enough to stay a name. */
const MAX_LENGTH = 120;

/** A small form to rename a bookmark. Saving an unchanged name just closes it. */
export function RenameBookmarkDialog({
  title,
  onSave,
  onClose,
}: {
  title: string;
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState('');
  return (
    <Dialog
      title="Rename bookmark"
      size="sm"
      onClose={onClose}
      onSubmit={() => {
        const name = value.trim();
        if (!name) return setError('Give the bookmark a name.');
        if (name !== title) onSave(name);
        onClose();
      }}
      actions={
        <>
          <PillButton onClick={onClose}>Cancel</PillButton>
          <PillButton type="submit" variant="primary">
            Save
          </PillButton>
        </>
      }
    >
      <TextField
        label="Name"
        value={value}
        maxLength={MAX_LENGTH}
        autoComplete="off"
        // Most renames replace the chapter's name outright, so it starts selected.
        onFocus={(e) => e.currentTarget.select()}
        error={error || undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
      />
    </Dialog>
  );
}

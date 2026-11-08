import { useState } from 'react';
import { Share, SquarePlus } from 'lucide-react';
import { Dialog, PillButton, SectionCard } from '@joepittsy/ui';
import { BOOK_COLOURS, iconPreview, setBookColour, useBookColour } from './bookColour';
import { offersInstall, useInstall } from './install';
import styles from './InstallCard.module.css';

/**
 * Settings' App card. Its button first offers the icon's colour (the tallest spine), applied at once to the tab and
 * to the icon links a Home Screen or install will copy, then installs where the browser can (Chromium's own dialog),
 * walks an iPhone through Share then Add to Home Screen, or points Mac Safari at its menu. Nothing when installed or
 * not installable.
 */
export function InstallCard({ className }: { className?: string }) {
  const { route, promptInstall } = useInstall();
  const [step, setStep] = useState<'closed' | 'pick' | 'steps'>('closed');
  const close = () => setStep('closed');
  if (!offersInstall(route)) return null;

  const next =
    route === 'prompt' ? (
      <PillButton
        variant="primary"
        onClick={() => {
          close();
          void promptInstall();
        }}
      >
        Install
      </PillButton>
    ) : route === 'ios' ? (
      <PillButton variant="primary" onClick={() => setStep('steps')}>
        Next
      </PillButton>
    ) : (
      <PillButton variant="primary" onClick={close}>
        Done
      </PillButton>
    );

  return (
    <SectionCard title="App" className={className}>
      <div className={styles.row}>
        <p className={styles.text}>
          {route === 'prompt' && "Install Storyshelf for its own window and icon, without the browser's bars."}
          {route === 'ios' &&
            "Add Storyshelf to your Home Screen for its own icon and a full-screen player, without the browser's bars."}
          {route === 'mac-safari' && (
            <>
              In Safari, choose <strong>File › Add to Dock</strong> to keep Storyshelf in its own window.
            </>
          )}
        </p>
        <PillButton onClick={() => setStep('pick')}>
          {route === 'prompt' ? 'Install Storyshelf' : route === 'ios' ? 'Add to Home Screen' : 'Choose the icon'}
        </PillButton>
      </div>

      {step === 'pick' && (
        <Dialog title="Choose your icon" onClose={close} actions={next}>
          <IconPicker />
          <p className={styles.after}>
            {route === 'mac-safari'
              ? 'Then choose File › Add to Dock. An app already in the Dock keeps the icon it was added with.'
              : 'The icon is set when you install. An installed app keeps the icon it was installed with.'}
          </p>
        </Dialog>
      )}

      {step === 'steps' && (
        <Dialog
          title="Add to Home Screen"
          size="sm"
          onClose={close}
          actions={
            <>
              <PillButton onClick={() => setStep('pick')}>Back</PillButton>
              <PillButton variant="primary" data-autofocus onClick={close}>
                Done
              </PillButton>
            </>
          }
        >
          <ol className={styles.steps}>
            <li>
              Tap <Share className={styles.glyph} aria-hidden /> <strong>Share</strong> in the browser's toolbar.
            </li>
            <li>
              Scroll down and tap <SquarePlus className={styles.glyph} aria-hidden />{' '}
              <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>.
            </li>
          </ol>
          <p className={styles.after}>
            Open Storyshelf from its new icon. You'll sign in once more there: the Home Screen app keeps its own
            storage, apart from the browser's.
          </p>
        </Dialog>
      )}
    </SectionCard>
  );
}

/** The book colours as a radio group of icon previews. Choosing one applies it straight away (the tab icon shows it). */
function IconPicker() {
  const chosen = useBookColour();
  return (
    <fieldset className={styles.picker}>
      <legend className={styles.legend}>Pick a colour for the book</legend>
      <div className={styles.grid}>
        {BOOK_COLOURS.map((c) => (
          <label key={c.id} className={styles.swatch}>
            {/* No visible names: the icons say it. The name stays for screen readers. */}
            <input
              type="radio"
              name="book-colour"
              aria-label={c.name}
              className={styles.radio}
              value={c.id}
              checked={c.id === chosen.id}
              onChange={() => setBookColour(c)}
              data-autofocus={c.id === chosen.id || undefined}
            />
            <img src={iconPreview(c)} alt="" className={styles.preview} draggable={false} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

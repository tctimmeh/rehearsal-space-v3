import { DEMUCS_DOWNLOAD } from '@shared/tools'
import { Button, Modal } from '../primitives'

interface DemucsInstallDialogProps {
  /** Why this machine cannot have it, or null when it can. */
  whyNot: string | null
  installing: boolean
  onInstall: () => void
  onDismiss: () => void
}

/**
 * What separating a track needs, before anything is downloaded for it.
 *
 * Everything else the app runs is fetched quietly at startup, being a few
 * megabytes each. demucs is the better part of a gigabyte and most people
 * never separate anything, so it is asked for rather than assumed — here,
 * where somebody has just asked for stems and the answer means something.
 */
export function DemucsInstallDialog({
  whyNot,
  installing,
  onInstall,
  onDismiss
}: DemucsInstallDialogProps) {
  return (
    <Modal
      title="Separating needs demucs"
      subtitle="The program that pulls a mix apart into its instruments"
      onDismiss={onDismiss}
      footer={
        <>
          <Button onClick={onDismiss}>Not now</Button>
          {whyNot === null ? (
            <Button variant="primary" disabled={installing} onClick={onInstall}>
              {installing ? 'Installing…' : 'Install it'}
            </Button>
          ) : null}
        </>
      }
    >
      {whyNot === null ? (
        <>
          <p className="modal__note">
            The app can install its own, which is {DEMUCS_DOWNLOAD}. It goes in the app's
            own folder, touches nothing else on the machine, and can be removed again from
            Settings when the room is wanted back.
          </p>
          <p className="modal__note">
            It runs in the background and takes a few minutes. Carry on playing while it
            does — the queue at the bottom of the window says how it is getting on.
          </p>
        </>
      ) : (
        <>
          <p className="modal__note">{whyNot}</p>
          <p className="modal__note">
            demucs installed on the machine some other way will still be used. Settings has
            a Choose… for pointing the app at one.
          </p>
        </>
      )}
    </Modal>
  )
}

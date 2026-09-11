import { useSong } from '@renderer/state/song'
import { useWaveformEdit } from '@renderer/state/waveformEdit'
import { Button, Modal } from '../primitives'

/**
 * Asked when something would leave a trim or a line-up behind — another
 * channel's, or another tool altogether.
 *
 * Three answers rather than two, because "not now" is a different thing from
 * "not ever": going somewhere else and keeping the work is the common case,
 * going somewhere else and throwing it away is the point of being able to
 * cancel, and staying put is what you want when you pressed the wrong thing.
 */
export function WaveformEditPrompt() {
  const asking = useWaveformEdit((state) => state.asking)
  const editing = useWaveformEdit((state) => state.editing)
  const stay = useWaveformEdit((state) => state.stay)
  const saveAndGo = useWaveformEdit((state) => state.saveAndGo)
  const discardAndGo = useWaveformEdit((state) => state.discardAndGo)
  const channels = useSong((state) => state.song?.channels)

  if (asking === null || editing === null) return null

  const name =
    channels?.find((one) => one.id === editing.channelId)?.name ?? editing.before.name

  return (
    <Modal
      title="Unsaved changes"
      onDismiss={stay}
      footer={
        <>
          <Button onClick={stay}>Cancel</Button>
          <Button onClick={() => void discardAndGo()}>Discard</Button>
          <Button variant="primary" onClick={() => void saveAndGo()}>
            Save
          </Button>
        </>
      }
    >
      <p>
        You have unsaved changes to {name}. Save these changes, discard them, or cancel and
        keep editing?
      </p>
    </Modal>
  )
}

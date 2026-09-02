import { useEffect, useState } from 'react'

import { Button, Modal } from '../primitives'

/**
 * What this is, and where it came from.
 *
 * The version is asked of the main process rather than built into the page:
 * it is whatever the running app was packaged as, and a number compiled into
 * the renderer is a number that can disagree with it.
 */
export function AboutModal({ onDismiss }: { onDismiss: () => void }) {
  const [version, setVersion] = useState<string | null>(null)
  const [homepage, setHomepage] = useState<string | null>(null)

  useEffect(() => {
    void window.rehearsal.app.version().then(setVersion)
    void window.rehearsal.app.homepage().then(setHomepage)
  }, [])

  return (
    <Modal
      title="About"
      onDismiss={onDismiss}
      footer={<Button onClick={onDismiss}>Done</Button>}
    >
      <div className="about">
        <h3 className="about__name">Rehearsal Space</h3>
        <p className="about__what">An all-in-one tool for music practice and song-writing.</p>
        <dl className="about__facts">
          <dt>Version</dt>
          <dd>{version ?? '…'}</dd>
          <dt>Source</dt>
          <dd>
            {homepage === null ? (
              '…'
            ) : (
              /* A button rather than an anchor: following a link inside the
                 window would replace the app with a web page. This hands it to
                 the desktop's own browser instead. */
              <button
                type="button"
                className="about__link"
                onClick={() => void window.rehearsal.app.openLink(homepage)}
              >
                {homepage.replace(/^https:\/\//, '')}
              </button>
            )}
          </dd>
        </dl>
      </div>
    </Modal>
  )
}

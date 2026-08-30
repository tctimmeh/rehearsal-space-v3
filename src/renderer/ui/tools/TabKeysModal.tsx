import { TAB_KEY_GROUPS, tabKeysInGroup } from '@core/tab/keys'
import { Button, Modal } from '../primitives'

/**
 * What the tablature editor answers to.
 *
 * The editor has no buttons for what it does — there is no button for typing a
 * fret — so this is the only place the keys are said out loud.
 */
export function TabKeysModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Modal
      title="Tablature keys"
      onDismiss={onDismiss}
      footer={<Button onClick={onDismiss}>Done</Button>}
    >
      {TAB_KEY_GROUPS.map((group) => (
        <section className="setting-section" key={group}>
          <div className="section-head">
            <h4>{group}</h4>
          </div>
          <dl className="keys">
            {tabKeysInGroup(group).map(({ keys, does }) => (
              <div className="keys__row" key={`${keys} ${does}`}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  )
}

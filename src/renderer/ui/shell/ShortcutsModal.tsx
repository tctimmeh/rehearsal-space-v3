import { HOTKEY_GROUPS, hotkeysInGroup } from '@core/keys/hotkeys'
import { Button, Modal } from '../primitives'

/**
 * Every key the app answers to.
 *
 * Read from the same table the keys are matched against, so the list cannot
 * come to disagree with what actually happens — a help page that lies about a
 * shortcut is worse than no help page.
 */
export function ShortcutsModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Modal
      title="Keyboard shortcuts"
      onDismiss={onDismiss}
      footer={<Button onClick={onDismiss}>Done</Button>}
    >
      {HOTKEY_GROUPS.map((group) => (
        <section className="setting-section" key={group}>
          <div className="section-head">
            <h4>{group}</h4>
          </div>
          <dl className="keys">
            {hotkeysInGroup(group).map(({ keys, does }) => (
              <div className="keys__row" key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {/* Not in the table: it belongs to whatever is on screen rather than to
          the app, and every dialog and panel answers it for itself. */}
      <section className="setting-section">
        <div className="section-head">
          <h4>Anywhere</h4>
        </div>
        <dl className="keys">
          <div className="keys__row">
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Close whatever is open</dd>
          </div>
        </dl>
      </section>
    </Modal>
  )
}

import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { Job } from '@shared/jobs'
import { useJobs, type Working } from '@renderer/state/jobs'
import { Button, Modal } from '../primitives'

/**
 * Background work reports here while you carry on working — a separation
 * already running keeps reporting while you set up the next one.
 */
export function ToastStack() {
  const { jobs, working, inspect } = useJobs()

  return (
    <>
      {jobs.length === 0 && working.length === 0 ? null : (
        <div className="toasts">
          {working.map((work) => (
            <WorkingToast key={work.id} work={work} />
          ))}
          {jobs.map((job) => (
            <Toast key={job.id} job={job} onInspect={() => void inspect(job)} />
          ))}
        </div>
      )}
      <JobLog />
    </>
  )
}

/**
 * The same card, for work with no process behind it: nothing to cancel, since
 * stopping halfway would leave the take neither kept nor thrown away, and no
 * log, since there is no program to have said anything.
 */
function WorkingToast({ work }: { work: Working }) {
  return (
    <div className="toast" data-state="running">
      <div className="toast__top">
        <span className="toast__lamp" style={{ background: 'var(--text-dim)' }} />
        <span className="toast__name">{work.title}</span>
      </div>
      <div className="toast__sub">{work.detail}</div>
      <div className="toast__bar toast__bar--waiting">
        <i />
      </div>
    </div>
  )
}

const LAMP_COLOR: Record<Job['state'], (subject: Job['subject']) => string> = {
  running: (subject) => CHANNEL_SUBJECT_COLOR[subject],
  done: () => 'var(--go)',
  failed: () => 'var(--mute)',
  cancelled: () => 'var(--text-faint)'
}

const STATE_NOTE: Record<Job['state'], string | null> = {
  running: null,
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

function Toast({ job, onInspect }: { job: Job; onInspect: () => void }) {
  const { cancel, dismiss } = useJobs()
  const note = STATE_NOTE[job.state]
  const showBar = job.state === 'running' && job.progress !== null

  return (
    <div className="toast" data-state={job.state}>
      <div className="toast__top">
        <span className="toast__lamp" style={{ background: LAMP_COLOR[job.state](job.subject) }} />
        <span className="toast__name">{job.title}</span>
        {job.state === 'running' && job.progress !== null ? (
          <span className="toast__pct">{Math.round(job.progress * 100)}%</span>
        ) : (
          <span className="toast__pct">{note}</span>
        )}
      </div>

      <div className="toast__sub">{job.error ?? job.detail}</div>

      {showBar ? (
        <div className="toast__bar">
          <i
            style={{
              width: `${(job.progress ?? 0) * 100}%`,
              background: CHANNEL_SUBJECT_COLOR[job.subject]
            }}
          />
        </div>
      ) : null}

      <div className="toast__actions">
        <button type="button" className="toast__link" onClick={onInspect}>
          Log
        </button>
        {job.state === 'running' ? (
          <button type="button" className="toast__link" onClick={() => void cancel(job.id)}>
            Cancel
          </button>
        ) : (
          <button type="button" className="toast__link" onClick={() => void dismiss(job.id)}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}

function JobLog() {
  const { inspecting, stopInspecting } = useJobs()
  if (inspecting === null) return null

  return (
    <Modal
      title={inspecting.job.title}
      subtitle={inspecting.job.detail}
      size="log"
      onDismiss={stopInspecting}
      footer={<Button onClick={stopInspecting}>Close</Button>}
    >
      <pre className="well job-log">{inspecting.lines.join('\n')}</pre>
    </Modal>
  )
}

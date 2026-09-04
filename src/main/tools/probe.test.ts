import { describe, expect, it } from 'vitest'

import { reasonForFailure } from './probe'

const waited = 90000

describe('why a fetched copy would not run', () => {
  /* The one that matters on a Mac: an unsigned build is not refused with a
     message, it is killed. Saying so is the difference between a report
     somebody can act on and "it would not run". */
  it('names a program the machine would not let run', () => {
    expect(reasonForFailure({ signal: 'SIGKILL' }, waited)).toMatch(/stopped it outright/)
  })

  it('says when it was still going and we gave up', () => {
    expect(reasonForFailure({ killed: true, signal: 'SIGTERM' }, waited)).toBe(
      'it had not answered after 90 seconds'
    )
  })

  /* A program that ran and complained has already said the useful thing. */
  it('quotes what the program itself said', () => {
    expect(
      reasonForFailure({ code: 1, stderr: 'bad interpreter: no such file\nand more' }, waited)
    ).toBe('it exited with code 1: bad interpreter: no such file')
  })

  it('says plainly when there was nothing there', () => {
    expect(reasonForFailure({ code: 'ENOENT' }, waited)).toBe('there was nothing there to run')
  })

  it('falls back to whatever it was handed', () => {
    expect(reasonForFailure({ message: 'something else entirely' }, waited)).toBe(
      'something else entirely'
    )
    expect(reasonForFailure(undefined, waited)).toBe('it did not say why')
  })
})

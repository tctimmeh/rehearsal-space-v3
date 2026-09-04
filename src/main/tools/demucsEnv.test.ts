import { describe, expect, it } from 'vitest'

import { uvProgress } from '@core/jobs/progress'
import {
  confinedEnv,
  DEMUCS_VERSION,
  DEMUCS_WITHOUT_SPHN,
  demucsInstallable,
  demucsLayout,
  installSteps,
  recipeFor
} from './demucsEnv'

const linux = { platform: 'linux', arch: 'x64' }

describe('where the environment goes', () => {
  it('keeps every part of it inside one directory', () => {
    const layout = demucsLayout('/home/someone/.config/app/tools', 'linux')

    for (const path of [layout.uv, layout.venv, layout.cache, layout.models, layout.pythons]) {
      expect(path.startsWith(layout.root)).toBe(true)
    }
    expect(layout.demucs).toBe('/home/someone/.config/app/tools/demucs/env/bin/demucs')
  })

  /* A venv on Windows puts its programs under Scripts, with a suffix. */
  it('knows where Windows puts a virtual environment', () => {
    const layout = demucsLayout('C:\\Users\\me\\AppData\\app\\tools', 'win32')

    expect(layout.demucs.endsWith('env\\Scripts\\demucs.exe')).toBe(true)
    expect(layout.python.endsWith('env\\Scripts\\python.exe')).toBe(true)
    expect(layout.uv.endsWith('demucs\\uv.exe')).toBe(true)
  })
})

describe('what it is run with', () => {
  const layout = demucsLayout('/tools', 'linux')
  const environment = confinedEnv(layout, 'linux', '/usr/bin:/bin')

  it("sends uv and the models it fetches into the app's own directory", () => {
    expect(environment['UV_CACHE_DIR']).toBe(layout.cache)
    expect(environment['UV_PYTHON_INSTALL_DIR']).toBe(layout.pythons)
    expect(environment['HF_HOME']).toBe(layout.models)
    expect(environment['TORCH_HOME']).toBe(layout.models)
  })

  /* demucs falls back to ffmpeg for audio it cannot read itself, and every
     channel here is an ogg. The app's own ffmpeg is not on the machine's PATH. */
  it("puts the app's own tools first on PATH", () => {
    expect(environment['PATH']).toBe('/tools:/usr/bin:/bin')
  })

  it('joins the PATH the way the platform does', () => {
    const windows = demucsLayout('C:\\tools', 'win32')

    expect(confinedEnv(windows, 'win32', 'C:\\Windows')['PATH']).toBe('C:\\tools;C:\\Windows')
  })

  /*
   * Python writes to a pipe in the machine's code page unless told
   * otherwise, and cp1252 cannot spell a ⧸ — which is what stands in for the
   * slash in a band's name. demucs prints the track's name before it starts.
   */
  it('has Python speak UTF-8, whatever the machine reads and writes', () => {
    expect(environment['PYTHONUTF8']).toBe('1')
    /* Named outright as well: UTF-8 mode loses to a PYTHONIOENCODING that is
       already set, and this one is set over whatever the machine had. */
    expect(environment['PYTHONIOENCODING']).toBe('utf-8')
  })

  /* Whatever the user's shell says about Python is not about this Python. */
  it('clears what the machine had to say about Python', () => {
    for (const name of ['VIRTUAL_ENV', 'PYTHONHOME', 'PYTHONPATH', 'UV_INDEX_URL']) {
      expect(name in environment).toBe(true)
      expect(environment[name]).toBeUndefined()
    }
  })
})

describe('which machines can have it', () => {
  /* Everywhere sphn publishes a build, which is where the newest demucs can
     read audio at all. */
  it('installs the newest where the newest can go', () => {
    for (const machine of [
      linux,
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'win32', arch: 'x64' }
    ]) {
      expect(demucsInstallable(machine)).toBeNull()
      expect(recipeFor(machine)?.packages[0]).toBe(`demucs==${DEMUCS_VERSION}`)
    }
  })

  /*
   * sphn publishes for three machines. Where it does not, the last demucs
   * that decoded without it goes instead — it takes the same arguments and
   * writes the same files, so nothing above here knows the difference.
   */
  it('installs the one that does without sphn where sphn cannot go', () => {
    for (const machine of [
      { platform: 'darwin', arch: 'x64' },
      { platform: 'linux', arch: 'arm64' }
    ]) {
      expect(demucsInstallable(machine)).toBeNull()
      expect(recipeFor(machine)?.packages[0]).toBe(`demucs==${DEMUCS_WITHOUT_SPHN}`)
    }
  })

  /* That demucs decodes with torchaudio, and a torch built against numpy 1
     cannot load numpy 2 — which is a crash rather than a refusal. */
  it('holds down what the older one was built against', () => {
    const older = recipeFor({ platform: 'darwin', arch: 'x64' })

    expect(older?.python).toBe('3.11')
    expect(older?.packages).toContain('torchaudio<2.3')
    expect(older?.packages).toContain('numpy<2')
  })

  it('says why not where nothing can go', () => {
    /* PyTorch publishes nothing a Windows machine on ARM could run. */
    expect(demucsInstallable({ platform: 'win32', arch: 'arm64' })).toMatch(/PyTorch/)
    expect(demucsInstallable({ platform: 'freebsd', arch: 'x64' })).toMatch(/Linux, macOS/)
    expect(recipeFor({ platform: 'win32', arch: 'arm64' })).toBeNull()
  })
})

describe('the commands that build it', () => {
  const layout = demucsLayout('/tools', 'linux')
  const steps = installSteps(
    layout,
    recipeFor(linux) ?? { python: '3.12', packages: [] },
    ['htdemucs'],
    confinedEnv(layout, 'linux', '/usr/bin'),
    uvProgress
  )

  it('makes the environment, fills it, and then runs it', () => {
    expect(steps[0]?.args.slice(0, 2)).toEqual(['venv', '--python'])
    expect(steps[1]?.args).toContain(`demucs==${DEMUCS_VERSION}`)
    expect(steps.at(-1)?.command).toBe(layout.demucs)
  })

  /* The build that carries a graphics stack is several times the size, and
     nothing here would use it. */
  it('asks for the processor-only build of PyTorch', () => {
    expect(steps[1]?.args).toContain('--torch-backend=cpu')
  })

  /* demucs imports numpy everywhere and declares it only for Intel macs, so
     installing what it asks for leaves something that cannot be imported. */
  it('asks for numpy, which demucs needs and does not say so', () => {
    expect(steps[1]?.args).toContain('numpy')
  })

  it('pins what it installs rather than taking whatever is newest', () => {
    expect(steps[1]?.args.some((arg) => arg.startsWith('torch<'))).toBe(true)
    expect(steps[1]?.args).toContain(`demucs==${DEMUCS_VERSION}`)
  })

  it('fetches the weights of every model it was given', () => {
    const prefetch = steps.filter((step) => step.command === layout.python)

    expect(prefetch).toHaveLength(1)
    expect(prefetch[0]?.args.join(' ')).toContain('get_model("htdemucs")')
  })

  it('runs the long ones where progress can be read', () => {
    expect(steps[0]?.progress).toBeTypeOf('function')
    expect(steps[1]?.progress).toBeTypeOf('function')
  })
})

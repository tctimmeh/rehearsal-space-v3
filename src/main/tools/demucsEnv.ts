import { posix, win32 } from 'node:path'

import type { ProgressReader } from '@core/jobs/progress'
import type { JobStep } from '../jobs/manager'
import type { Machine } from './releases'

/**
 * Everything about the demucs environment that is a matter of arithmetic:
 * where its parts go, what it is run with, and the commands that build it.
 *
 * None of it touches the disk, so all of it can be read back in a test —
 * including the Windows and macOS shapes, from here on Linux.
 */

/** Pinned: what installs is what was tried, not whatever is newest today. */
export const DEMUCS_VERSION = '4.1.0'
/** demucs 4.1 wants 3.10 or better; every part of it has wheels for 3.12. */
export const PYTHON_VERSION = '3.12'
/**
 * The last demucs that read audio without sphn.
 *
 * sphn publishes builds for three machines, and demucs 4.1 cannot be
 * installed anywhere else without a Rust compiler. 4.0.1 decoded through
 * torchaudio instead, takes the same arguments, writes the same files in the
 * same places, and separates with the same two models — so where the newest
 * cannot go, this goes instead, and nothing above it knows the difference.
 */
export const DEMUCS_WITHOUT_SPHN = '4.0.1'
/** What that one was built against, and what its dependencies still ship for. */
export const PYTHON_FOR_OLDER = '3.11'
/** demucs asks only for torch 2.1 or better, which in a year means anything. */
export const TORCH_LIMIT = 'torch<3'
/**
 * numpy, which demucs needs and does not say so.
 *
 * demucs 4.1.0 imports numpy at the top of `transformer.py` on every platform,
 * but only declares it for Intel macs. Installed without it, demucs cannot be
 * imported at all — so it is asked for here rather than left to a dependency
 * list that is wrong.
 */
export const NUMPY = 'numpy'

export interface DemucsLayout {
  /** The app's tools directory, which is where its own ffmpeg lives. */
  tools: string
  /** Everything below is inside this, so removing it removes all of it. */
  root: string
  uv: string
  /** Where uv keeps the Python it fetches. Kept: a retry should be quick. */
  pythons: string
  /** uv's wheel cache, deleted once the environment is built. */
  cache: string
  venv: string
  python: string
  demucs: string
  /** Model weights, from the HuggingFace hub and the older torch repo both. */
  models: string
  /** Scratch, for the uv download. */
  incoming: string
}

export function demucsLayout(tools: string, platform: string): DemucsLayout {
  /* Joined the way the platform named joins, rather than the way the machine
     running this does, so the Windows shape can be read back anywhere. */
  const { join } = platform === 'win32' ? win32 : posix
  const root = join(tools, 'demucs')
  const venv = join(root, 'env')
  /* A venv puts its programs under Scripts on Windows and bin everywhere else. */
  const scripts = join(venv, platform === 'win32' ? 'Scripts' : 'bin')
  const exe = (name: string): string => (platform === 'win32' ? `${name}.exe` : name)
  return {
    tools,
    root,
    uv: join(root, exe('uv')),
    pythons: join(root, 'pythons'),
    cache: join(root, 'cache'),
    venv,
    python: join(scripts, exe('python')),
    demucs: join(scripts, exe('demucs')),
    models: join(root, 'models'),
    incoming: join(root, 'incoming')
  }
}

/**
 * The environment every one of these commands is run with.
 *
 * Two jobs. It keeps the whole business inside the app's own directory —
 * Python, wheels, model weights — so that nothing lands in the user's caches
 * and removing it really does remove it. And it puts the app's own tools
 * directory at the front of PATH, because demucs falls back to ffmpeg for
 * formats it cannot decode itself, and every channel here is an ogg: without
 * this, separation on a machine with no system ffmpeg would fail inside
 * demucs, which is the last place anybody would look for it.
 *
 * Anything the user's own shell had to say about Python is cleared. A stray
 * VIRTUAL_ENV or PYTHONPATH would be answered before this, and the failure
 * would look like the install being broken.
 */
export function confinedEnv(
  layout: DemucsLayout,
  platform: string,
  systemPath: string
): Record<string, string | undefined> {
  const separator = platform === 'win32' ? ';' : ':'
  return {
    PATH: `${layout.tools}${separator}${systemPath}`,

    UV_CACHE_DIR: layout.cache,
    UV_PYTHON_INSTALL_DIR: layout.pythons,
    /* uv's own Python, never one the machine happens to have. */
    UV_PYTHON_PREFERENCE: 'only-managed',
    UV_PYTHON_DOWNLOADS: 'automatic',
    UV_NO_MODIFY_PATH: '1',
    /* No uv.toml anywhere may redirect the cache or where wheels come from. */
    UV_NO_CONFIG: '1',
    /* It is not writing to a terminal, and a bar redrawn with \r is no use. */
    UV_NO_PROGRESS: '1',

    /*
     * Python writes to a pipe in whatever the machine's code page is, which
     * on an English Windows is cp1252 and cannot spell most of what a song
     * title might contain. demucs prints the name of the track before it
     * starts, so a file with a ⧸ in it — which is what stands in for the
     * slash in AC⧸DC — killed the separation before a note was read.
     *
     * Both are set, and the order matters: UTF-8 mode alone loses to a
     * PYTHONIOENCODING the machine already had, so the encoding is named
     * outright as well. It is what this app reads the output as anyway.
     */
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',

    HF_HOME: layout.models,
    TORCH_HOME: layout.models,
    HF_HUB_DISABLE_TELEMETRY: '1',

    VIRTUAL_ENV: undefined,
    PYTHONHOME: undefined,
    PYTHONPATH: undefined,
    UV_INDEX: undefined,
    UV_INDEX_URL: undefined,
    UV_DEFAULT_INDEX: undefined,
    UV_PYTHON: undefined
  }
}

/** Which demucs to install here, and what to build it with. */
export interface Recipe {
  python: string
  /** Everything installed into the environment, pinned. */
  packages: string[]
}

const NEWEST: Recipe = {
  python: PYTHON_VERSION,
  packages: [`demucs==${DEMUCS_VERSION}`, TORCH_LIMIT, NUMPY]
}

/*
 * PyTorch stopped building for Intel Macs after 2.2, which is why demucs
 * marks that limit itself; and a torch built against numpy 1 cannot load
 * numpy 2, which is a crash rather than a refusal to install. Both are held
 * down, and torchaudio comes along because this is the demucs that decodes
 * with it.
 */
const OLDER: Recipe = {
  python: PYTHON_FOR_OLDER,
  packages: [`demucs==${DEMUCS_WITHOUT_SPHN}`, 'torch<2.3', 'torchaudio<2.3', 'numpy<2']
}

/**
 * What to install on this machine, or null where nothing can be.
 *
 * Only Windows on anything but an Intel processor is left out, and only
 * because PyTorch publishes nothing it could run.
 */
export function recipeFor({ platform, arch }: Machine): Recipe | null {
  if (platform === 'linux') return arch === 'x64' ? NEWEST : arch === 'arm64' ? OLDER : null
  if (platform === 'darwin') return arch === 'arm64' ? NEWEST : arch === 'x64' ? OLDER : null
  if (platform === 'win32') return arch === 'x64' ? NEWEST : null
  return null
}

/** Why demucs cannot be installed on this machine, or null when it can. */
export function demucsInstallable(machine: Machine): string | null {
  if (recipeFor(machine) !== null) return null
  const { platform, arch } = machine
  if (!['linux', 'darwin', 'win32'].includes(platform)) {
    return 'The app can only install demucs on Linux, macOS or Windows.'
  }
  return `The app cannot install demucs for this processor: PyTorch publishes no build for ${platform} ${arch}.`
}

/**
 * The commands that build the environment, in order.
 *
 * The last one runs demucs. It costs a second and it is the difference
 * between "installed" and "installed and works": a demucs that will not
 * import fails here, with the reason in the job's log, rather than the next
 * time somebody asks for stems.
 */
export function installSteps(
  layout: DemucsLayout,
  recipe: Recipe,
  models: readonly string[],
  environment: Record<string, string | undefined>,
  progress: () => ProgressReader
): JobStep[] {
  const withEnv = (step: Omit<JobStep, 'env'>): JobStep => ({ ...step, env: environment })
  return [
    withEnv({
      command: layout.uv,
      args: ['venv', '--python', recipe.python, layout.venv],
      progress: progress(),
      weight: 1
    }),
    withEnv({
      command: layout.uv,
      args: [
        'pip',
        'install',
        '--python',
        layout.python,
        /* PyTorch's own processor-only build: a fifth of the size of the one
           that carries a graphics stack nothing here would use. */
        '--torch-backend=cpu',
        ...recipe.packages
      ],
      progress: progress(),
      weight: 8
    }),
    /* Every model the stems dialog offers, fetched now. Leaving one to be
       fetched later means a separation that sits saying nothing for minutes
       the first time somebody picks it. */
    ...models.map((model) =>
      withEnv({
        command: layout.python,
        args: ['-c', `from demucs.pretrained import get_model; get_model(${quoted(model)})`],
        weight: 2
      })
    ),
    withEnv({ command: layout.demucs, args: ['--help'], weight: 1 })
  ]
}

const quoted = (text: string): string => JSON.stringify(text)

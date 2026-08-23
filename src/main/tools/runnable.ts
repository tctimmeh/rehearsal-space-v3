import { access, constants, stat } from 'node:fs/promises'

/**
 * A directory carries the execute bit too — on a directory it means "you may
 * traverse me" — so a folder named `demucs` would otherwise pass for the tool
 * itself. That is not hypothetical: a PyInstaller build puts the binary inside
 * a directory of the same name.
 */
export async function isRunnable(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return false
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

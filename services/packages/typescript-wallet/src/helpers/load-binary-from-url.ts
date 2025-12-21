import fs from 'node:fs/promises'
import path from 'node:path'
import { ResultAsync } from 'neverthrow'
import { typedError } from './typed-error'

const appDir = path.resolve('./')

export function loadBinaryFromPath(path: string) {
  const file = fs.readFile(`${appDir}${path}`)

  return ResultAsync.fromPromise(file, typedError)
}

import crypto from 'node:crypto'

export function secureRandom(byteCount: number): string {
  return crypto.randomBytes(byteCount).toString('hex')
}

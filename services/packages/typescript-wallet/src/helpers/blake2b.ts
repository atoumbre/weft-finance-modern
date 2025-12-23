import type { Result } from 'neverthrow'
import { Buffer } from 'node:buffer'
import blake from 'blakejs'
import { err, ok } from 'neverthrow'

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.length)
  const view = new Uint8Array(arrayBuffer)
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i]
  }
  return arrayBuffer
}

export function bufferToUnit8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(toArrayBuffer(buffer))
}

export function blake2b(input: Buffer): Result<Buffer, Error> {
  try {
    return ok(blake.blake2bHex(bufferToUnit8Array(input), undefined, 32)).map(
      hex => Buffer.from(hex, 'hex'),
    )
  }
  catch (error) {
    return err(error as Error)
  }
}

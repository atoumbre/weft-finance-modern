// import { createSdkError, SdkError } from '@radixdlt/babylon-gateway-api-sdk'
import type { Result } from 'neverthrow'
import type { Observable } from 'rxjs'
import { err, ok } from 'neverthrow'
import { map, merge, of, Subject, switchMap, timer } from 'rxjs'

export interface ExponentialBackoffInput {
  multiplier?: number
  maxDelayTime?: number
  timeout?: number
  interval?: number
}
export type ExponentialBackoff = typeof getExponentialBackoff
export function getExponentialBackoff({
  maxDelayTime = 10_000,
  multiplier = 2,
  timeout,
  interval = 2_000,
}: ExponentialBackoffInput = {}) {
  const trigger = new Subject<void>()
  let numberOfRetries = 0

  const backoff$ = merge(
    of(0),
    trigger.pipe(
      map(() => {
        numberOfRetries = numberOfRetries + 1
        return numberOfRetries
      }),
    ),
  ).pipe(
    switchMap((numberOfRetries) => {
      const delayTime = numberOfRetries * interval * multiplier
      const delay = delayTime > maxDelayTime ? maxDelayTime : delayTime
      return timer(delay).pipe(map(() => ok(numberOfRetries)))
    }),
  )

  const withBackoffAndTimeout$: Observable<Result<number, string>> = timeout
    ? merge(
        backoff$,
        timer(timeout).pipe(
          map(() => err('failedToPollSubmittedTransaction')),
        ),
      )
    : backoff$

  return { trigger, withBackoff$: withBackoffAndTimeout$ }
}

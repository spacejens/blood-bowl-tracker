# logging

`packages/logging` holds `ErrorLogService`, the one way code running inside
the Discord bot's process logs a caught exception. `apps/discord-bot`,
`packages/discord-client`, `packages/db` (`AdvisoryLockService`) and
`packages/api-server` (`RpcMiddleware`) all use it, so the same failure looks
the same in `fly logs` wherever it was caught.

## Why it exists

Nest's `Logger` treats a string second argument differently by level:

- `error(message, x)` prints `x` as a stack only when it looks like one (a
  newline followed by an indented `at file:line:column` frame). Any other
  string replaces the log's context label.
- `warn(message, x)` has no stack argument at all: any trailing string is the
  context label.

Passing a raw `unknown` error, or `err.stack ?? String(err)`, therefore loses
the context label (or the error detail) whenever the value is not a framed
stack.

## Using it

Inject the service and pass your own `Logger`, so the context stays the class
that caught the error:

- `logError(logger, summary, error)` logs at error level. A framed stack goes
  in the second argument; otherwise the detail (the unframed stack text, an
  Error's message, or the stringified value) is appended to the summary as
  `summary: detail`.
- `logWarn(logger, summary, error)` logs at warn level, always as one
  message, `summary: detail`, where the detail is the Error's stack (or its
  message when it has no stack) or the stringified value. This deviates from
  `logError`'s shaping because Nest 12's `warn()` treats a trailing string as
  the context label, so the detail has to live in the message.

There is no `LoggingModule`. The service has no dependencies, so each module
whose providers use it lists `ErrorLogService` in its own `providers`, as
`DiscordClientModule`, `AdvisoryLockModule` and `ApiServerModule` do.

Log calls that pass only a string, with no error object, do not need it.

## Advisory lock messages

`AdvisoryLockService`'s warnings keep their summaries, such as
`Failed to reserve the advisory-lock connection`, and carry the underlying
error after a colon on the same line, under the `AdvisoryLockService` context.
Search `fly logs` for the summary text; the detail that follows names the
cause (for example a refused connection).

## Testing

`ErrorLogService`'s own spec covers the message shaping. A consumer's spec
provides a `vitest-mock-extended` mock of it and asserts the logger, summary
and error it was called with, rather than spying on `Logger.prototype`.

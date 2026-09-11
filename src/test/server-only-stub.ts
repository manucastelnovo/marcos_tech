/**
 * `server-only` throws by design when imported outside a React Server
 * Component. Use cases legitimately import it, and tests legitimately run them
 * in plain Node, so the test runner aliases the package to this empty module.
 */
export {};

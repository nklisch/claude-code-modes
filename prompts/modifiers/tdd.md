# TDD by default

Default to test-driven development. The order is: write a failing test, write the minimum code to make it pass, refactor with tests green, repeat.

- For changes to existing code, start by writing or updating a test that fails for the right reason — the bug being fixed, the behavior being added, the contract being changed. The test is your specification.
- Refactor only when tests are green. Use pass/fail as the safety net that lets you restructure freely.
- Run the tests after each change. A test you didn't run isn't a test.
- Our tests need to be real. They should interact with genuine code paths. A stub, a test than only interacts with mocks, or a test that is tautological -- always true -- does not meet this criteria.
- Verify your work yourself before asking the user to. The test runner is yours to drive — run what you wrote, run the surrounding suite, watch the output. Reserve the user's verification for things only they can check: visual UI, a real-world environment, a product-judgment call.
- Tests are permanent fixtures, not temporary scripts. When you need to verify behavior, write the test that will verify it forever — not a throwaway Python script, a bash / echo script, or something tossed in /tmp. Verification belongs in the test suite where it stays useful next week and next year.
- If the user describes a change without naming a test, your first move is to propose the test. State what you'll assert, watch them confirm or redirect, then proceed.
- Our tests need to be safe, and not have unexpected or harmful side effects, especially if they interact with OS or CLI commands. Wonder what would happen if something went wrong, and get ahead of the problem.

## Prototyping mode (explicit opt-out)

When the user says "let's prototype" or "create a prototype," switch to working without tests. The user is signaling that learning what works comes first; correctness comes second.

- Build directly. Skip the failing-test-first step. Hard-code values where it accelerates learning.
- As you go, keep a running list of behaviors that will need test coverage when the prototype matures. Surface this list at natural break points or when the user asks.
- Don't add tests reactively during prototyping unless asked. Dedicated time for each — that's what the opt-out is about.

## Resuming TDD

When the user says "let's work on the tests," switch back to test-first work. Pick up the running list of untested behaviors and turn them into tests, smallest and most foundational first. Each test follows the standard loop: red, green, refactor.

<example>
User: "Add a retry parameter to the http client."
Good: Write a test that calls the client with retry=2 and asserts it retries twice on a transient failure. Run it; watch it fail. Add the retry logic. Run it; watch it pass. Run the surrounding tests to confirm nothing else broke.
</example>

<example>
User: "Let's prototype the new caching layer."
Good: Build the cache directly with reasonable defaults, no tests yet. In the response, note: "TODO when we work on tests: eviction policy, TTL expiry, concurrent access, cache miss path." When the user later says "let's work on the tests," start with eviction.
</example>

<example>
You need to verify that a new env-var loader correctly reads three sources (process env, .env file, default).
Good: Add a test in `env-loader.test.ts` with one case per source, assert the resolved value for each, run `bun test env-loader`, watch them pass. The test stays in the suite.
Bad: Write `scripts/check-env.ts` that imports the loader and `console.log`s the result for each case. The check works once, then rots, and nothing catches a regression.
</example>

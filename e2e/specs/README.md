# e2e/specs

This is the **live flow-test suite** for `@devdigest/e2e`, not a set of
in-flight design docs — these `NN-name.flow.json` files ARE the tests. Each
one is an ordered list of deterministic `agent-browser` commands (locators,
waits, assertions) run in sequence by `run.ts` against the web app. They are
executed in CI and by `./scripts/e2e.sh` / `npm run e2e:hermetic` on every
run, in filename order, against one shared browser session.

Do **not** delete a flow file or mark it "done" and remove it — that removes
real coverage. See [`README.md` § How a flow works](../README.md#how-a-flow-works)
for the JSON format and the coverage table of what each numbered flow checks.

To add coverage for a new page/feature, add a new `NN-name.flow.json` here
(next available number) rather than folding it into an existing flow, unless
it extends the same page/session state the existing flow already set up.

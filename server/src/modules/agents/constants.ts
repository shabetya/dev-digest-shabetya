/** Constants for the agents module. */

/** Initial config version recorded for a newly-created agent. */
export const INITIAL_AGENT_VERSION = 1;

/** Default agent description when none is supplied on insert. */
export const DEFAULT_AGENT_DESCRIPTION = '';

/** AC-22's historical window for the per-agent cost/time estimate: the N
 *  most recent `status='done'` `agent_runs` rows, workspace-scoped, no time
 *  cutoff (Clarifications #4). */
export const RECENT_RUNS_WINDOW = 10;

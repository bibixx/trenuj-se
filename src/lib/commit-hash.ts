/**
 * The git commit hash of the current build, injected at build time by Vite
 * (see `getCommitHash` in `vite.config.ts`). Falls back to "unknown" when the
 * hash can't be resolved.
 */
export const commitHash = import.meta.env.VITE_COMMIT_HASH as string;

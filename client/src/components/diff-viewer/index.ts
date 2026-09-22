/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component, FileCard (reused directly by
   Smart Diff's grouped view), and the DiffCommentApi/DiffFindingsApi contracts. */
export { DiffViewer } from "./DiffViewer";
export { FileCard } from "./FileCard";
export type { DiffCommentApi, DiffFindingsApi } from "./comments";

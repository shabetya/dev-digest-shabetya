import type { EvalExpectationType } from "@devdigest/shared";
import { findingSkeleton, type EditorForm, type InputTab } from "./helpers";

export type EditorAction =
  | { type: "field"; field: "name" | "diff" | "filesText" | "prTitle" | "prBody" | "expectedText"; value: string }
  | { type: "expectation"; value: EvalExpectationType }
  | { type: "tab"; value: InputTab }
  | { type: "skeleton" };

export function editorReducer(state: EditorForm, a: EditorAction): EditorForm {
  switch (a.type) {
    case "field":
      return { ...state, [a.field]: a.value };
    case "expectation":
      return { ...state, expectation: a.value };
    case "tab":
      return { ...state, tab: a.value };
    case "skeleton":
      return { ...state, expectedText: findingSkeleton() };
  }
}

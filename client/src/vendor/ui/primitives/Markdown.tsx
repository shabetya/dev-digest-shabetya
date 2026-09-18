import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (replaces prototype mdLite). Inline + GFM, plus block-level
    elements (headings, lists, code fences) — full skill/rubric bodies use those,
    not just inline findings text. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: "1.35em", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "var(--text-primary)", margin: "18px 0 8px" }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: "1em", fontWeight: 650, color: "var(--text-primary)", margin: "14px 0 6px" }}>
              {children}
            </h3>
          ),
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          // Tailwind's base reset strips list-style — restore it explicitly,
          // otherwise ordered/unordered lists render as unmarked paragraphs.
          ul: ({ children }) => (
            <ul style={{ margin: "0 0 10px", paddingLeft: 22, listStyle: "disc" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "0 0 10px", paddingLeft: 22, listStyle: "decimal" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: "0 0 4px", display: "list-item" }}>{children}</li>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                padding: "2px 12px",
                borderLeft: "3px solid var(--border-strong)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre
              className="mono"
              style={{
                margin: "0 0 12px",
                padding: "12px 14px",
                borderRadius: 6,
                background: "var(--bg-hover)",
                overflowX: "auto",
                fontSize: "0.85em",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const text = String(children);
            // Fenced blocks either carry a `language-*` className or (when no
            // language tag was given) still contain a newline — inline code never does.
            const isBlock = !!className || text.includes("\n");
            if (isBlock) {
              return (
                <code className={className} style={{ color: "var(--text-primary)" }}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="mono"
                style={{
                  fontSize: "0.92em",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-hover)",
                  color: "var(--accent-text)",
                }}
              >
                {children}
              </code>
            );
          },
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

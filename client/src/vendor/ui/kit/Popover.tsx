import React from "react";

/**
 * Click-to-toggle popover whose panel is positioned with `position: fixed`
 * from the trigger's measured bounding rect, rather than `position: absolute`
 * in normal flow (as `Dropdown` does). This is required so the panel isn't
 * clipped by an `overflow: hidden` ancestor (e.g. the PR list's table card) —
 * a `position: fixed` element's containing block is the viewport, not the
 * nearest scrolling/clipping ancestor, as long as no ancestor establishes a
 * new containing block (transform/filter/etc — none of this app's chrome
 * does). Closes on outside click, Escape, or window scroll/resize (scrolling
 * would otherwise leave the panel floating at a stale position).
 */
export function Popover({
  trigger,
  content,
  align = "left",
}: {
  trigger: React.ReactNode;
  content: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => setOpen(false), []);

  const openAtTrigger = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + 6,
      left: align === "right" ? rect.right : rect.left,
    });
    setOpen(true);
  }, [align]);

  React.useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Capture-phase so this also sees scrolls on any scrollable ancestor of the
    // trigger, not just window — but that means it fires for scrolling inside
    // the panel itself (it has overflowY: auto), which must not close it.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else openAtTrigger();
        }}
        style={{ display: "inline-block" }}
      >
        {trigger}
      </div>
      {open && pos && (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: pos.top,
            ...(align === "right" ? { right: window.innerWidth - pos.left } : { left: pos.left }),
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            padding: 10,
            zIndex: 60,
            animation: "ddpop .12s ease",
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

"use client";

type KeyState = { up: boolean; down: boolean; left: boolean; right: boolean };

export function WasdGlyph({ keys }: { keys: KeyState }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 max-w-[160px]">
      <span />
      <Key label="W" on={keys.up} />
      <span />
      <Key label="A" on={keys.left} />
      <Key label="S" on={keys.down} />
      <Key label="D" on={keys.right} />
    </div>
  );
}

function Key({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={`h-10 flex items-center justify-center rounded-sm border zip-num text-sm font-bold tracking-wider transition-all ${
        on
          ? "bg-[rgba(39,180,205,0.18)] border-[var(--v2-cyan-bright)] text-[var(--v2-cyan-bright)] zip-glow-cyan"
          : "bg-[rgba(8,18,26,0.7)] border-[var(--v2-panel-edge)] text-[var(--v2-text-dim)]"
      }`}
    >
      {label}
    </div>
  );
}

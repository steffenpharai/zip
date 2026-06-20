# docs/images/

This directory holds visual assets referenced from the README and
other docs.

## Current state

The repository today uses **inline Mermaid diagrams** rather than
checked-in image files. Mermaid renders natively on GitHub and stays
in sync with the code (vs. PNG screenshots that go stale).

## When to add static images here

- **Screenshots** of the running HUD, the live dashboard, the
  SuperSplat browser walk-through. These can't be Mermaid-generated.
- **Photos** of the physical robot (chassis, Jetson mount, camera
  mount) for `docs/HARDWARE.md`.
- **Architecture diagrams** that are too complex for Mermaid syntax
  (e.g., timing diagrams, oscilloscope captures).
- **Branding assets** if/when a logo lands.

## Naming convention

```
<doc-or-context>-<subject>-<rev>.png
```

Examples:

- `readme-hud-cockpit-r1.png`
- `readme-system-overview-r2.svg`
- `hardware-chassis-mount-r1.jpg`

Use SVG when possible (sharp at all sizes, smaller file size, often
text-searchable). Use PNG for screenshots and photos.

## Generating Mermaid diagrams locally

You can preview Mermaid diagrams without GitHub by:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.svg
```

Or paste the Mermaid source into [https://mermaid.live](https://mermaid.live)
for an interactive preview.

## Suggested images to add (open task)

When the splat black-render fix verifies, add:

- `readme-splat-render-r1.png` — first successful browser splat
  walk-through, to replace the "WIP" badge in the README.

When Phase 6 lands:

- `readme-anchored-objects-r1.png` — HUD showing detected objects
  pinned to map cells.

When custom hardware lands:

- `hardware-custom-pcb-r1.jpg`, `hardware-jetson-mount-r1.jpg`.

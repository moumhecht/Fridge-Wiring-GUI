# Fridge Wiring Editor

A browser-based editor for dilution-refrigerator wiring diagrams. Runs entirely client-side, so it works on GitHub Pages or by opening `index.html` directly.

## Components
Attenuators, IR filters, low-pass filters (K&L / VLF), device boxes, title boxes, circulators, double-junction circulators, directional couplers, TWPAs, HEMTs, generic amplifiers, 50 Ω terminations, embedded images (e.g. chip layouts) and free text.

Every part can be relabelled, recoloured, rotated and mirrored horizontally/vertically.

## Fridge stages
On the **Stages & canvas** tab, choose nested "cans" (rounded or square), horizontal plates, or left-to-right columns. List one stage per line; `name | offset` overrides that stage's position.

## Using it
| Action | How |
| --- | --- |
| Add a part | Click or drag it from the palette |
| Draw a wire | Click a port (blue dot) or press **W**; click to add bends; finish on a port, by double-clicking, or with **Enter**. **Alt** allows diagonal segments |
| Edit a wire | Double-click it to add a bend; double-click a bend to remove it; drag a bend; drop an end onto a port to attach it |
| Rotate / mirror | **R** / **Shift+R**, **H**, **V** |
| Select several | Drag on empty canvas, or **Shift+click**. Editing a field changes every selected part |
| Duplicate / copy / paste | **Ctrl+D**, **Ctrl+C**, **Ctrl+V** |
| Undo / redo | **Ctrl+Z**, **Ctrl+Y** |
| Zoom | **Ctrl+wheel** or the toolbar buttons |

**Save** / **Open** use a JSON file that includes any embedded images. **Export SVG** (vector, editable in Inkscape/Illustrator) and **Export PNG** (3× resolution) can crop to the drawing. Work also autosaves in the browser.



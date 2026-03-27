# Build Claims -- D22.2

## Files Changed
- [MODIFY] js/neuro-renderer.js -- Added GPU resource cleanup in destroy(), added handleResize() function, attached ResizeObserver in init()

## Verification Results
- Build: PASS (no build step; vanilla JS loaded via script tags)
- Tests: SKIPPED (no test suite configured)
- Lint: SKIPPED (no linter configured)
- Syntax: PASS (`node -c js/neuro-renderer.js`)

## Claims
- [ ] Claim 1: `destroy()` now calls `gl.deleteBuffer(posBuffer)`, `gl.deleteBuffer(colorBuffer)`, `gl.deleteBuffer(brightnessBuffer)`, and `gl.deleteProgram(program)` BEFORE nulling the `gl` reference (lines 121-126), preventing GPU resource leaks on view toggle.
- [ ] Claim 2: `destroy()` disconnects the `_resizeObserver` (lines 117-120) before DOM teardown, preventing callbacks on a destroyed renderer.
- [ ] Claim 3: A new `_resizeObserver` module-level variable is declared at line 42, initialized to `null`.
- [ ] Claim 4: `init()` creates a `ResizeObserver` on the `wrap` element (lines 100-101) that calls `handleResize()` when the container size changes.
- [ ] Claim 5: `handleResize()` (lines 286-298) guards against inactive state, checks if width actually changed, deletes old GPU buffers before rebuilding layout, and calls `buildLayout()` + `buildLabels()` to recompute positions and labels.
- [ ] Claim 6: The public API of `window.NeuroRenderer` is unchanged: `{ init, destroy, isActive }` (line 414).
- [ ] Claim 7: `handleResize()` is private to the IIFE -- not exposed on the public API.
- [ ] Claim 8: No other files were modified.

## Gaps and Assumptions
- Smoke testing (toggle 5+ times, resize window) must be done in a browser -- cannot be verified in CI/node.
- ResizeObserver is well-supported in modern browsers but not available in Node.js or very old browsers (IE11). This is acceptable since WebGL2 already requires a modern browser.
- The `handleResize()` function deletes old buffers before `buildLayout()` creates new ones; if `buildLayout()` throws, the buffers will be null. This matches the existing error handling strategy (no try/catch anywhere in the renderer).

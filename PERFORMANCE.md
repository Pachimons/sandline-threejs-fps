# Runtime CPU optimization — 2026-10-29

Baseline: upstream commit `a68a2b0b62d49e8aca47d082a00ab12d5cdfa2ec`.
This pass preserves gameplay and art assets. It targets repeated CPU work in
collision, navigation, and character presentation.

## Changes

- Ray/box intersection uses scalar slab calculations instead of allocating four
  arrays on every probe. Parallel-ray handling and hit distances are unchanged.
- Navigation precomputes the static grid's four neighbors in the original
  traversal order and reuses typed parent/queue buffers. Returned paths are still
  independent arrays. This trades approximately 39 KiB of retained scratch and
  topology storage for fewer allocations during bot path requests.
- Crouching uses already-cached thigh/shin bones rather than searching the model
  four times per update. Held-weapon shadow policy is applied at creation and
  weapon changes instead of traversing the gun every frame.
- The camera controller no longer calculates an unused smoothed velocity vector
  or allocates its temporary target on each update.

The navigation grid was already static at module initialization. Its topology
and scratch storage remain local to each JS module instance, and calls are
synchronous. A future dynamic-map implementation must rebuild the navigation
grid and neighbor table together.

## Measurements

Run `npm run benchmark:runtime`. No binary assets or browser are required.
Each process warms up each workload, then reports the median of five samples.
Baseline and optimized processes were run in alternating order for three pairs
on the same host with Node.js v22.16.0. The values below are the median of each
version's three process medians. Raw measurements and result checksums are saved
in `runtime-benchmark.json`.

- 300 navigation requests: 7.157 ms → 3.160 ms (55.8% less elapsed CPU workload time).
- 100,000 ray/box intersections: 4.909 ms → 3.832 ms (21.9% less time).
- 3,600 simulation ticks with six bots: 98.949 ms → 55.865 ms (43.5% less time).

All path, ray and simulation-state checksums matched the baseline across every
comparison process. The benchmark includes checksum generation in both versions.
The simulation workload represents 60 seconds of game time, executed without
waiting for real time. These are local CPU benchmarks, **not browser FPS, GPU,
phone thermal, loading-time, or memory measurements**. Presentation changes are
not covered by these CPU workload numbers.

To compare a later version, run the same benchmark script in two clean checkouts
with the same Node version and dependencies, alternate execution order, compare
checksums first, then compare multiple process medians. Do not run build/test
tasks concurrently with benchmark collection.

## Validation and limits

- `npm run typecheck`: passed.
- `npm run test:core`: 60/60 passed, including four new collision/navigation
  regressions. Ray intersections are also checked against Three.js for 5,000
  deterministic cases; route fixtures cover cover, ties and outside-map targets.
- `npm run build`: passed. Existing bundle-size and classic site-config script
  warnings remain.
- The upstream core suite originally passed 55/56. Its failing test expected
  all purchases to be disabled, while the existing economy explicitly permits
  purchases during the first 20 seconds in spawn. The test now verifies that
  existing rule and rejects purchases outside spawn or after the window; the
  economy implementation and prices have not changed.
- Model/audio integration suites and browser visual comparison were not run:
  the public repository omits their required binary assets. Character caching
  changes pass TypeScript checking but still need visual validation once the
  authorized assets are available.

Art changes, animation retargeting, death-pose geometry correction, culling,
dynamic maps and major architecture changes are deferred. They require separate
validation rather than being mixed into this CPU optimization pass.

## Second pass — 2026-10-29

This comparison uses the **first optimization pass** above as its baseline.
Node CPU sampling identified bot movement/collision and navigation as the
remaining CPU-heavy sections in these synthetic workloads.

### Further changes

- Circle/box collisions reject boxes outside the radius on either axis before
  calling `Math.hypot`. The original circular-corner distance is used for all
  remaining boxes, preserving exact tangency behavior and custom-box support.
- When an endpoint's closest lattice cell is free, navigation skips scanning the
  whole grid. Blocked cells, outside-map positions and near ties retain the
  original exhaustive search and tie-breaking.
- A 64-entry FIFO caches paths by start/end grid cells. Cached entries contain
  compact cell indices; every caller receives fresh point objects. Route index
  payload is bounded by about 210 KiB even at the theoretical maximum path
  length; JS container overhead is additional. `clearPathCache()` drops only
  route entries, **not** the static navigation topology.
- Avoidance candidate angles and their sine/cosine values are calculated once
  instead of allocating the list and recalculating trigonometry during steering.

The cache is valid for the existing static map. Future edits to navigation
topology must rebuild that topology and invalidate routes together; simply
calling `clearPathCache()` does not enable runtime map changes.

### Comparison with the first pass

The same three alternating process pairs and five-sample medians were used.
Route caches are explicitly cleared at the start of **every timed navigation
or simulation workload**, so no routes are inherited from the previous timed
sample. Caching can still help repeated requests within that workload, as it
does during gameplay. First-pass code has no path cache. Both versions ran the
same updated benchmark script and produced identical result checksums.
Raw samples are in `runtime-benchmark-pass2.json`.

- 300 navigation requests: 3.024 ms → 2.185 ms (27.7% less time).
- 20,000 circle/box collision queries: 4.083 ms → 0.836 ms (79.5% less time).
- 3,600 simulation ticks, six bots: 54.548 ms → 22.044 ms (59.6% less time).
- 3,600 simulation ticks, ten bots: 189.979 ms → 63.221 ms (66.7% less time).
- Unchanged ray/box control: 3.603 ms → 3.689 ms (2.4% more time in this run).
  No ray implementation changes were made in this pass; do not interpret these
  small local timing differences as a ray-performance improvement.

These remain CPU-only Node.js measurements, with checksum work included, and
are not FPS or physical-phone results. The ten-bot workload uses the existing
maximum team counts (player plus four teammates, five opponents) with all actors
under bot control. Six-bot and ten-bot simulations execute 60 seconds of game
time without real-time waiting.

### Verification

- `npm run test:core`: **69/69 passed**. New coverage includes custom collision
  boxes and radius edge cases, numerical endpoint ties, cache mutation/eviction/
  reset, and six full-match replay checks across three seeds and two team sizes.
- Replay checks hash each simulation tick's event stream, final state, and frame
  count against the first-pass version; all six match exactly.
- `npm run build`: passed, including TypeScript checking. Previous build warnings
  remain. `git diff --check` also passed.
- No visual resources or gameplay rules were changed in the second pass. Model/
  audio integration suites and browser/phone visual checks still require the
  missing authorized assets described above.

# TODO

- [ ] Add Vitest unit tests for pure utility functions (`parseDate`, `expandDateRange`, `formatDateStr`, `stringToColor`, `getWorkTypeColor`, `loadSettings`, `getSeniorityRank`) to catch regressions in date/color/settings logic. No SDK mocking required — these functions have no Sigma dependencies.
- [ ] Ability to resize columns in the table by dragging
- [ ] **Drag and drop assignment chips** — drag a chip to a new day column and/or a different employee row; the plugin emits the intended change back to Sigma via variables + a dedicated `onChipDrop` action trigger. Sigma owns the write-back; the plugin only reports intent.

  **Interaction model**
  - Dragging a chip moves the entire assignment (preserving duration for multi-day events): `newStartDate` shifts by the delta, `newEndDate` shifts by the same delta.
  - Dragging across rows (employee → employee) is supported; emit `newEmployee` when the target row differs from the source.
  - No resize-by-edge handle in v1 — body drag only.
  - Weekend days are not skipped when computing the new end date; shift calendar days literally.

  **Sigma variables to add to `configureEditorPanel`**
  - `newEmployee` (`variable`) — target employee name (may equal source if only the date changed)
  - `newStartDate` (`variable`) — new start date after the shift (YYYY-MM-DD)
  - `newEndDate` (`variable`) — new end date after the shift (YYYY-MM-DD); empty string if the assignment has no end date
  - `onChipDrop` (`action-trigger`) — fires after all variables are set; Sigma listens to this to trigger write-back

  **Existing variables already available (reuse)**
  - `selectedRowId` — identifies which assignment is being moved
  - `selectedEmployee` — source employee name (already emitted on cell click; reuse for drag source)

  **Implementation notes**
  - Use HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) or pointer events; no external DnD library.
  - On `dragStart`: store source `rowId`, `employeeCol`, `dateCol`, `endDateCol` in drag state (ref or dataTransfer).
  - On `dragOver` a day cell: highlight the drop target (e.g. blue border overlay); call `e.preventDefault()` to allow drop.
  - On `drop`: compute delta from source date to target date, derive `newStartDate`/`newEndDate`, set all variables, fire `onChipDrop`.
  - Visual drag preview: browser default ghost image is acceptable for v1.
  - Drop targets: only Mon–Fri cells are valid; reject drops on department label rows and the grid header.
  - The chip's existing `stopPropagation` on click must not interfere with drag events — `onDragStart` is separate from `onClick`.
- [x] Click on a chip to open a modal to edit it 
- [x] Add row ID to the configuration
- [x] Update on click action to stop propagation when clicking on a chip. Only emit on click event when clicking on a cell outside of a chip. 
- [ ] Settings button (⚙️ FAB) and modal are not appearing when Edit Mode is toggled on — debug why `config.editMode` is not resolving to `true` and fix.
- [x] Make the entire employee row a uniform height — empty cells should stretch to match the tallest cell in that row (which may have multiple stacked chips). Currently empty cells use a fixed `minHeight` while occupied cells grow with content, causing mismatched row heights.
- [x] Show 1 week, 2 weeks, or 4 weeks within the view. Switch between them dynamically. 
- [x] Emit a Sigma event when a user clicks a day cell for an employee (including empty cells). Use `useVariable` to write the selected employee name and date back to Sigma variables, and `useActionTrigger` to fire an action — allowing the workbook to react (e.g. open a detail panel or pre-fill a form). Add corresponding `variable` and `action-trigger` entries to `configureEditorPanel`.
- [x] Dynamically assign work type colors based on distinct values found in the data, rather than relying on the predefined `workTypeColors` map. Unknown types currently fall back to `defaultColor`; instead, auto-generate a stable color palette from the actual values present in `workTypeCol` and merge with any user-overrides already saved in settings.
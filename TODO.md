# TODO

- [x] Emit a Sigma event when a user clicks a day cell for an employee (including empty cells). Use `useVariable` to write the selected employee name and date back to Sigma variables, and `useActionTrigger` to fire an action — allowing the workbook to react (e.g. open a detail panel or pre-fill a form). Add corresponding `variable` and `action-trigger` entries to `configureEditorPanel`.
- [ ] Dynamically assign work type colors based on distinct values found in the data, rather than relying on the predefined `workTypeColors` map. Unknown types currently fall back to `defaultColor`; instead, auto-generate a stable color palette from the actual values present in `workTypeCol` and merge with any user-overrides already saved in settings.
- [ ] Settings button (⚙️ FAB) and modal are not appearing when Edit Mode is toggled on — debug why `config.editMode` is not resolving to `true` and fix.
- [x] Make the entire employee row a uniform height — empty cells should stretch to match the tallest cell in that row (which may have multiple stacked chips). Currently empty cells use a fixed `minHeight` while occupied cells grow with content, causing mismatched row heights.

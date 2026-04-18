# Sigma Staff Scheduler Plugin

A Gantt-style weekly scheduling grid built as a [Sigma Computing](https://www.sigmacomputing.com/) plugin. Designed for audit firms to visualize and manage staff assignments across a workweek.

![Schedule View](https://placeholder.com/screenshot)

---

## Features

- **Weekly grid view** — Mon–Fri columns with sticky day headers and week navigation (prev/next/today)
- **Staff rows** — grouped by department, sub-grouped by office, sorted by seniority then name
- **Color-coded assignment chips** — work type colors (Audit, Tax, PTO, Training, etc.) configurable per deployment
- **Multi-assignment support** — multiple engagements on the same day stack as chips in a single cell
- **Cell click events** — emits selected employee + date to Sigma variables and action triggers
- **Settings modal** — edit mode FAB for customizing the title and work type colors, saved back to Sigma config
- **Graceful loading states** — distinct messages for unconfigured source, missing columns, and empty data

---

## Data Source Schema

The plugin expects a **long/tall format** table — one row per staff member per day assignment.

| Column | Type | Description |
|---|---|---|
| Employee Name | Text | Full name of the staff member |
| Office | Text | Office location (e.g. "New York", "Chicago") |
| Role / Seniority | Text | e.g. Supervisor, Senior, Staff, Intern |
| Department | Text | e.g. Audit, Tax, Advisory |
| Date | Date / Datetime | The work date for this assignment |
| Client / Engagement | Text | Name of the client or engagement |
| Work Type | Text | Category for color coding (see Work Types below) |

If a person has multiple engagements on the same day, include one row per engagement — they will stack as chips in that cell.

### Seniority Sort Order

Roles are sorted top-to-bottom within each department:

`Supervisor → Senior-Senior → Senior → Semi-Senior → Staff → Exp Staff → Intern → Other`

Matching is case-insensitive and substring-based (e.g. `"Senior Manager"` matches `Senior`).

---

## Work Type Colors (Defaults)

| Work Type | Color |
|---|---|
| Audit | `#4A90D9` (blue) |
| Review | `#7ED321` (green) |
| Compile | `#F5A623` (orange) |
| Tax | `#9B59B6` (purple) |
| PTO / Holiday | `#E74C3C` (red) |
| Training | `#1ABC9C` (teal) |
| Special Project | `#E67E22` (dark orange) |
| Leave | `#7F8C8D` (gray) |
| Other / Client Notes | `#BDC3C7` (light gray) |

Colors are fully customizable via the settings modal (enable **Edit Mode** in the editor panel).

---

## Setup

### 1. Install & Run

```bash
npm install
npm start        # dev server at http://localhost:5173
npm run build    # production build → build/
```

### 2. Register with Sigma

1. In your Sigma org, go to **Administration → Plugin Manager**
2. Add a new plugin pointing to `http://localhost:5173` (dev) or your hosted `build/` URL
3. Add the plugin to a workbook as an element

### 3. Configure the Editor Panel

Map each column in the plugin's editor panel:

| Panel Field | Maps To |
|---|---|
| Source | The Sigma element (table/viz) containing your scheduling data |
| Employee Name | Employee name column |
| Office | Office/location column |
| Role / Seniority | Role column |
| Department | Department column |
| Date | Date column |
| Client / Engagement Name | Engagement name column |
| Work Type (for color) | Work type / category column |

### 4. Optional: Cell Click Events

To react to cell clicks in the workbook:

| Panel Field | Maps To |
|---|---|
| Selected Employee Variable | A Sigma workbook variable to receive the clicked employee name |
| Selected Date Variable | A Sigma workbook variable to receive the clicked date (`YYYY-MM-DD`) |
| Cell Click Action | A Sigma action trigger (e.g. open a modal, filter another element) |

These are all optional — the grid works without them.

### 5. Settings / Edit Mode

Enable **Edit Mode** in the editor panel to reveal the ⚙️ button in the bottom-right corner of the plugin. Use it to:
- Edit the scheduler title
- Customize work type colors
- Reset to defaults

Settings are serialized as JSON and stored in the **Settings Config** text field in the editor panel.

---

## Tech Stack

- [React 18](https://react.dev/)
- [Vite 5](https://vitejs.dev/)
- [`@sigmacomputing/plugin`](https://www.npmjs.com/package/@sigmacomputing/plugin) SDK
- No external UI libraries — plain inline styles only

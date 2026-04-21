/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useMemo, useCallback } from 'react';
import { client, useConfig, useElementData, useElementColumns, useVariable, useActionTrigger } from '@sigmacomputing/plugin';

// ─── Editor Panel (module-level) ─────────────────────────────────────────────

client.config.configureEditorPanel([
  { name: 'source',        type: 'element' },
  { name: 'employeeCol',   type: 'column', source: 'source', allowMultiple: false, label: 'Employee Name' },
  { name: 'officeCol',     type: 'column', source: 'source', allowMultiple: false, label: 'Office' },
  { name: 'roleCol',       type: 'column', source: 'source', allowMultiple: false, label: 'Role / Seniority' },
  { name: 'departmentCol', type: 'column', source: 'source', allowMultiple: false, label: 'Department' },
  { name: 'dateCol',       type: 'column', source: 'source', allowMultiple: false, label: 'Date', allowedTypes: ['date', 'datetime'] },
  { name: 'clientCol',     type: 'column', source: 'source', allowMultiple: false, label: 'Client / Engagement Name' },
  { name: 'workTypeCol',   type: 'column', source: 'source', allowMultiple: false, label: 'Work Type (for color)' },
  { name: 'endDateCol',        type: 'column', source: 'source', allowMultiple: false, label: 'End Date (Optional)', allowedTypes: ['date', 'datetime'] },
  { name: 'config',            type: 'text',           label: 'Settings Config (JSON)', defaultValue: '{}' },
  { name: 'editMode',          type: 'toggle',         label: 'Edit Mode' },
  { name: 'selectedEmployee',  type: 'variable',       label: 'Selected Employee Variable' },
  { name: 'selectedDate',      type: 'variable',       label: 'Selected Date Variable' },
  { name: 'onCellClick',       type: 'action-trigger', label: 'Cell Click Action' },
]);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  title: 'Staff Scheduler',
  workTypeColors: {},
  defaultColor: '#D5D8DC',
  weekStartsOn: 'monday',
};

const COL_KEYS = [
  'employeeCol', 'officeCol', 'roleCol', 'departmentCol',
  'dateCol', 'endDateCol', 'clientCol', 'workTypeCol',
];

const REQUIRED_COLS = [
  'employeeCol', 'officeCol', 'roleCol', 'departmentCol',
  'dateCol', 'clientCol', 'workTypeCol',
]; // endDateCol is optional

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SENIORITY_ORDER = [
  'supervisor',
  'senior-senior', 'senior senior', 'senior sr',
  'senior',
  'semi-senior', 'semi senior', 'semisenior',
  'staff',
  'exp staff', 'experienced staff',
  'intern',
];

const TABS = ['Schedule', 'Utilization', 'Staff View', 'Client View', 'In The Queue'];

const DAY_WIDTH = { 1: 120, 2: 90, 4: 70 };

// ─── Utilities ────────────────────────────────────────────────────────────────

function getSeniorityRank(role) {
  if (!role) return 997;
  const lower = role.toLowerCase().trim();
  for (let i = 0; i < SENIORITY_ORDER.length; i++) {
    if (lower.includes(SENIORITY_ORDER[i])) return i;
  }
  return 996;
}

function padTwo(n) {
  return String(n).padStart(2, '0');
}

function formatDateStr(d) {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

function parseDate(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : formatDateStr(value);
  }

  if (typeof value === 'number') {
    // Sigma can send seconds (10 digits) or milliseconds (13 digits)
    const ms = value > 9_999_999_999 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : formatDateStr(d);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Date-only strings like "2026-02-23" — parse without timezone shift
    const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const d = new Date(
        parseInt(dateOnly[1]),
        parseInt(dateOnly[2]) - 1,
        parseInt(dateOnly[3])
      );
      return isNaN(d.getTime()) ? null : formatDateStr(d);
    }
    // ISO with time / other formats
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : formatDateStr(d);
  }

  return null;
}

function expandDateRange(startStr, endStr) {
  if (!endStr || endStr <= startStr) return [startStr];
  const dates = [];
  const cursor = new Date(startStr + 'T00:00:00');
  const end    = new Date(endStr   + 'T00:00:00');
  while (cursor <= end) {
    dates.push(formatDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDisplay(d) {
  return `${padTwo(d.getMonth() + 1)}/${padTwo(d.getDate())}/${d.getFullYear()}`;
}

function loadSettings(jsonStr) {
  try {
    const parsed = jsonStr && jsonStr.trim() ? JSON.parse(jsonStr) : {};
    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      workTypeColors: {
        ...DEFAULT_SETTINGS.workTypeColors,
        ...(parsed.workTypeColors || {}),
      },
    };
    console.log('[Scheduler] Settings loaded:', merged);
    return merged;
  } catch (err) {
    console.warn('[Scheduler] Failed to parse settings JSON, using defaults:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const col = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * col).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return hslToHex(Math.abs(hash) % 360, 58, 42);
}

function getWorkTypeColor(workType, workTypeColors, defaultColor) {
  if (!workType) return defaultColor;
  const lower = workType.toLowerCase();
  for (const [key, color] of Object.entries(workTypeColors)) {
    if (key.toLowerCase() === lower) return color;
  }
  return defaultColor;
}

function isLightColor(hex) {
  const c = hex.replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Perceived brightness
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function toRows(data, config) {
  const firstKey = COL_KEYS.find(k => config[k] && data[config[k]]);
  if (!firstKey) return [];
  const rowCount = data[config[firstKey]]?.length ?? 0;
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const row = {};
    for (const key of COL_KEYS) {
      const colId = config[key];
      row[key] = colId ? (data[colId]?.[i] ?? null) : null;
    }
    rows.push(row);
  }
  return rows;
}

// ─── Styles (shared objects) ──────────────────────────────────────────────────

const S = {
  navBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.22)',
    color: '#fff',
    borderRadius: 5,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    fontFamily: 'inherit',
  },
  todayBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.22)',
    color: '#fff',
    borderRadius: 5,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'inherit',
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 2,
    padding: '4px 6px',
    borderRight: '1px solid #E4E7EB',
    borderBottom: '1px solid #E4E7EB',
    minHeight: 38,
    flex: 1,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
};

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ message }) {
  return (
    <div style={{
      display: 'flex',
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F4F6F9',
      color: '#667',
      fontSize: 14,
      fontFamily: 'system-ui, -apple-system, Inter, sans-serif',
      padding: 24,
      textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

// ─── SettingsModal ────────────────────────────────────────────────────────────

function SettingsModal({ settings, onSave, onClose }) {
  const [local, setLocal] = useState(() => ({
    ...settings,
    workTypeColors: { ...settings.workTypeColors },
  }));

  const updateColor = (key, val) =>
    setLocal(prev => ({ ...prev, workTypeColors: { ...prev.workTypeColors, [key]: val } }));

  const handleReset = () =>
    setLocal({ ...DEFAULT_SETTINGS, workTypeColors: { ...DEFAULT_SETTINGS.workTypeColors } });

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: '28px 28px 20px',
        width: 500,
        maxHeight: '82vh',
        overflowY: 'auto',
        boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        fontFamily: 'system-ui, -apple-system, Inter, sans-serif',
      }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: '#0D1B2A' }}>
          Scheduler Settings
        </h3>

        {/* Title */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Title
        </label>
        <input
          value={local.title}
          onChange={e => setLocal(prev => ({ ...prev, title: e.target.value }))}
          style={{
            width: '100%', padding: '7px 10px',
            border: '1px solid #D1D5DB', borderRadius: 5,
            fontSize: 13, marginBottom: 20, boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />

        {/* Work type colors */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Work Type Colors
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 22 }}>
          {Object.entries(local.workTypeColors).map(([key, color]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={color}
                onChange={e => updateColor(key, e.target.value)}
                style={{ width: 30, height: 22, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer', padding: 1, background: 'none' }}
              />
              <span style={{ fontSize: 12, color: '#374151' }}>{key}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
          <button onClick={handleReset} style={{
            padding: '7px 14px', border: '1px solid #D1D5DB', borderRadius: 5,
            background: '#F9FAFB', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}>
            Reset Defaults
          </button>
          <button onClick={onClose} style={{
            padding: '7px 14px', border: '1px solid #D1D5DB', borderRadius: 5,
            background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={() => onSave(local)} style={{
            padding: '7px 18px', border: 'none', borderRadius: 5,
            background: '#0D1B2A', color: '#fff', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ColorLegend ──────────────────────────────────────────────────────────────

function ColorLegend({ workTypeColors }) {
  // Deduplicate colors that share the same hex (e.g. PTO & Holiday)
  const seen = new Set();
  const entries = Object.entries(workTypeColors).filter(([, color]) => {
    if (seen.has(color + '_placeholder')) return true; // keep all labels
    return true;
  });

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px 14px',
      padding: '5px 0 8px',
      fontSize: 10,
    }}>
      {entries.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            background: color,
            flexShrink: 0,
            border: isLightColor(color) ? '1px solid rgba(255,255,255,0.3)' : 'none',
          }} />
          <span style={{ color: '#A8B8CC', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ViewTabs ─────────────────────────────────────────────────────────────────

function ViewTabs({ activeTab, onTabChange }) {
  return (
    <div style={{
      display: 'flex',
      background: '#0D1B2A',
      borderBottom: '1px solid #1E3048',
      paddingLeft: 12,
      flexShrink: 0,
    }}>
      {TABS.map(tab => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              padding: '9px 18px',
              border: 'none',
              borderBottom: isActive ? '2px solid #4A90D9' : '2px solid transparent',
              background: 'transparent',
              color: isActive ? '#fff' : '#5B7A99',
              cursor: tab === 'Schedule' ? 'pointer' : 'default',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              fontFamily: 'inherit',
              letterSpacing: 0.2,
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

// ─── SchedulerHeader ──────────────────────────────────────────────────────────

function SchedulerHeader({ title, weekStart, weekView, workTypeColors, onPrev, onNext, onToday, onViewChange }) {
  const rangeEnd = addDays(weekStart, weekView * 7 - 1);

  return (
    <div style={{
      background: '#0D1B2A',
      color: '#fff',
      padding: '14px 18px 0',
      flexShrink: 0,
    }}>
      {/* Top row: title + nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: 0.3, color: '#fff' }}>
          {title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.22)' }}>
            {[1, 2, 4].map(w => (
              <button
                key={w}
                onClick={() => onViewChange(w)}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRight: w !== 4 ? '1px solid rgba(255,255,255,0.22)' : 'none',
                  background: weekView === w ? 'rgba(255,255,255,0.22)' : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: weekView === w ? 700 : 400,
                  fontFamily: 'inherit',
                  letterSpacing: 0.2,
                }}
              >
                {w}W
              </button>
            ))}
          </div>

          <button onClick={onPrev} style={S.navBtn} title="Previous">←</button>
          <span style={{
            fontSize: 12, fontWeight: 500,
            minWidth: 195, textAlign: 'center',
            color: '#C8D8E8', letterSpacing: 0.2,
          }}>
            {fmtDisplay(weekStart)}&nbsp;&nbsp;–&nbsp;&nbsp;{fmtDisplay(rangeEnd)}
          </span>
          <button onClick={onNext} style={S.navBtn} title="Next">→</button>
          <button onClick={onToday} style={S.todayBtn}>Today</button>
        </div>
      </div>

      {/* Color legend */}
      <ColorLegend workTypeColors={workTypeColors} />
    </div>
  );
}

// ─── GridHeader ───────────────────────────────────────────────────────────────

function GridHeader({ weekDays, weekView, weekStart }) {
  const dayWidth = DAY_WIDTH[weekView] ?? 120;

  const leftCellStyle = (width, left, borderBottom = '2px solid #C8CDD5') => ({
    position: 'sticky',
    left,
    zIndex: 5,
    width,
    minWidth: width,
    background: '#EEF1F5',
    borderRight: '1px solid #D4D8DE',
    borderBottom,
    padding: '6px 8px',
    fontSize: 10,
    fontWeight: 700,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    flexShrink: 0,
  });

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 6, background: '#EEF1F5' }}>
      {/* Week-label row (only for 2W / 4W) */}
      {weekView > 1 && (
        <div style={{ display: 'flex' }}>
          {/* Left spacer — covers the 3 sticky columns */}
          <div style={leftCellStyle(270, 0, '1px solid #D4D8DE')} />

          {Array.from({ length: weekView }, (_, w) => {
            const wStart = addDays(weekStart, w * 7);
            const wEnd   = addDays(weekStart, w * 7 + 4);
            return (
              <div key={w} style={{
                flex: 5,
                minWidth: 5 * dayWidth,
                background: '#EEF1F5',
                borderRight: '1px solid #D4D8DE',
                borderBottom: '1px solid #D4D8DE',
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
                color: '#374151',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}>
                {fmtDisplay(wStart)}&nbsp;–&nbsp;{fmtDisplay(wEnd)}
              </div>
            );
          })}
        </div>
      )}

      {/* Day header row */}
      <div style={{ display: 'flex' }}>
        <div style={leftCellStyle(60,  0)}>Office</div>
        <div style={leftCellStyle(80,  60)}>Role</div>
        <div style={leftCellStyle(130, 140)}>Employee</div>

        {weekDays.map((dateStr, i) => {
          const d = new Date(dateStr + 'T00:00:00');
          return (
            <div key={dateStr} style={{
              flex: 1,
              minWidth: dayWidth,
              background: '#EEF1F5',
              borderRight: '1px solid #D4D8DE',
              borderBottom: '2px solid #C8CDD5',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{DAY_NAMES[i % 5]}</span>
              <span style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
                {d.getMonth() + 1}/{d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AssignmentChip ───────────────────────────────────────────────────────────

function AssignmentChip({ clientName, workType, color }) {
  const light = isLightColor(color);
  return (
    <div
      title={`${clientName || ''}${workType ? ` — ${workType}` : ''}`}
      style={{
        background: color,
        color: light ? '#2D3748' : '#fff',
        borderRadius: 3,
        padding: '2px 6px',
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        cursor: 'default',
        lineHeight: 1.5,
        border: light ? '1px solid rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {clientName || '—'}
    </div>
  );
}

// ─── AssignmentCell ───────────────────────────────────────────────────────────

function AssignmentCell({ assignments, workTypeColors, defaultColor, bg, onCellClick }) {
  if (!assignments || assignments.length === 0) {
    return (
      <div
        style={{ ...S.cell, background: bg, cursor: onCellClick ? 'pointer' : 'default' }}
        onClick={onCellClick}
      />
    );
  }

  return (
    <div
      style={{ ...S.cell, background: bg, cursor: onCellClick ? 'pointer' : 'default' }}
      onClick={onCellClick}
    >
      {assignments.map((a, idx) => (
        <AssignmentChip
          key={idx}
          clientName={a.clientCol}
          workType={a.workTypeCol}
          color={getWorkTypeColor(a.workTypeCol, workTypeColors, defaultColor)}
        />
      ))}
    </div>
  );
}

// ─── EmployeeRow ──────────────────────────────────────────────────────────────

function EmployeeRow({ employee, weekDays, assignmentMap, workTypeColors, defaultColor, isEven, dayWidth, onCellClick }) {
  const bg = isEven ? '#FFFFFF' : '#F7F9FB';

  const leftCell = (content, width, left, bold = false) => (
    <div style={{
      position: 'sticky',
      left,
      zIndex: 2,
      width,
      minWidth: width,
      background: bg,
      borderRight: '1px solid #E4E7EB',
      borderBottom: '1px solid #E4E7EB',
      padding: '4px 8px',
      fontSize: 11,
      fontWeight: bold ? 600 : 400,
      color: '#374151',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      boxSizing: 'border-box',
      minHeight: 38,
      alignSelf: 'stretch',
      flexShrink: 0,
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
        {content || ''}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      {leftCell(employee.officeCol,   60,  0)}
      {leftCell(employee.roleCol,     80,  60)}
      {leftCell(employee.employeeCol, 130, 140, true)}

      {weekDays.map(dateStr => {
        const key = `${employee.employeeCol}||${dateStr}`;
        const assignments = assignmentMap[key] || [];
        return (
          <div key={dateStr} style={{ flex: 1, minWidth: dayWidth ?? 120, display: 'flex', flexDirection: 'column' }}>
            <AssignmentCell
              assignments={assignments}
              workTypeColors={workTypeColors}
              defaultColor={defaultColor}
              bg={bg}
              onCellClick={onCellClick ? () => onCellClick(employee.employeeCol, dateStr) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── DepartmentGroup ──────────────────────────────────────────────────────────

function DepartmentGroup({ department, employees, weekDays, assignmentMap, workTypeColors, defaultColor, baseRowIndex, dayWidth, onCellClick }) {
  return (
    <>
      {/* Department label — full-width sticky row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#1A2E45',
        color: '#A8C0D8',
        padding: '4px 12px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        borderBottom: '1px solid #243C55',
        minHeight: 24,
        position: 'sticky',
        left: 0,
        zIndex: 3,
        width: '100%',
      }}>
        {department}
      </div>

      {employees.map((emp, idx) => (
        <EmployeeRow
          key={`${emp.employeeCol}__${emp.officeCol}__${emp.roleCol}`}
          employee={emp}
          weekDays={weekDays}
          assignmentMap={assignmentMap}
          workTypeColors={workTypeColors}
          defaultColor={defaultColor}
          isEven={(baseRowIndex + idx) % 2 === 0}
          dayWidth={dayWidth}
          onCellClick={onCellClick}
        />
      ))}
    </>
  );
}

// ─── SchedulerGrid ────────────────────────────────────────────────────────────

function SchedulerGrid({ rows, weekStart, weekView, settings, onCellClick }) {
  const dayWidth = DAY_WIDTH[weekView] ?? 120;

  const weekDays = useMemo(() => {
    const days = [];
    for (let w = 0; w < weekView; w++) {
      for (let d = 0; d < 5; d++) {
        days.push(formatDateStr(addDays(weekStart, w * 7 + d)));
      }
    }
    return days;
  }, [weekStart, weekView]);

  // Derive unique employees (key = employeeCol|office|role|dept to handle name collisions)
  const employeeMap = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const name = row.employeeCol;
      if (!name) continue;
      // Use name as key; first occurrence wins for metadata
      if (!map.has(name)) {
        map.set(name, {
          employeeCol:   row.employeeCol,
          officeCol:     row.officeCol,
          roleCol:       row.roleCol,
          departmentCol: row.departmentCol,
        });
      }
    }
    return map;
  }, [rows]);

  // Build assignment lookup: `${employeeName}||${YYYY-MM-DD}` → row[]
  // If a row has endDateCol, expand across every date in the range.
  const assignmentMap = useMemo(() => {
    const map = {};
    for (const row of rows) {
      if (!row.employeeCol) continue;
      const startStr = parseDate(row.dateCol);
      if (!startStr) continue;
      const endStr = parseDate(row.endDateCol);
      for (const dateStr of expandDateRange(startStr, endStr)) {
        const key = `${row.employeeCol}||${dateStr}`;
        if (!map[key]) map[key] = [];
        map[key].push(row);
      }
    }
    return map;
  }, [rows]);

  // Group by department, sorted alphabetically; within dept sort by seniority then name
  const departmentGroups = useMemo(() => {
    const depts = {};
    for (const emp of employeeMap.values()) {
      const dept = emp.departmentCol || 'Other';
      if (!depts[dept]) depts[dept] = [];
      depts[dept].push(emp);
    }
    for (const emps of Object.values(depts)) {
      emps.sort((a, b) => {
        const rankDiff = getSeniorityRank(a.roleCol) - getSeniorityRank(b.roleCol);
        if (rankDiff !== 0) return rankDiff;
        return (a.employeeCol || '').localeCompare(b.employeeCol || '');
      });
    }
    return Object.entries(depts).sort(([a], [b]) => a.localeCompare(b));
  }, [employeeMap]);

  let globalRowIndex = 0;

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      overflowX: 'auto',
      position: 'relative',
      background: '#F4F6F9',
    }}>
      {/* Min-width ensures horizontal scroll kicks in when viewport is narrow */}
      <div style={{ minWidth: 270 + weekView * 5 * dayWidth, position: 'relative' }}>
        <GridHeader weekDays={weekDays} weekView={weekView} weekStart={weekStart} />

        {departmentGroups.map(([dept, employees]) => {
          const base = globalRowIndex;
          globalRowIndex += employees.length;
          return (
            <DepartmentGroup
              key={dept}
              department={dept}
              employees={employees}
              weekDays={weekDays}
              assignmentMap={assignmentMap}
              workTypeColors={settings.workTypeColors}
              defaultColor={settings.defaultColor}
              baseRowIndex={base}
              dayWidth={dayWidth}
              onCellClick={onCellClick}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── App (root) ───────────────────────────────────────────────────────────────

export default function App() {
  // All hooks unconditionally at top
  const config = useConfig();
  const data   = useElementData(config.source);
  // useElementColumns is required by the SDK even if not directly used for rendering
  useElementColumns(config.source);

  const [weekStart,    setWeekStart]    = useState(() => getMondayOfWeek(new Date()));
  const [weekView,     setWeekView]     = useState(1);
  const [activeTab,    setActiveTab]    = useState('Schedule');
  const [showSettings, setShowSettings] = useState(false);

  const settings = useMemo(() => loadSettings(config.config), [config.config]);
  const editMode = config.editMode === true || config.editMode === 'true';

  const handlePrev      = useCallback(() => setWeekStart(d => addDays(d, -7 * weekView)), [weekView]);
  const handleNext      = useCallback(() => setWeekStart(d => addDays(d,  7 * weekView)), [weekView]);
  const handleToday     = useCallback(() => setWeekStart(getMondayOfWeek(new Date())), []);
  const handleViewChange = useCallback(w => setWeekView(w), []);

  const handleSaveSettings = useCallback(newSettings => {
    console.log('[Scheduler] Settings saved:', newSettings);
    client.config.set({ config: JSON.stringify(newSettings, null, 2) });
    setShowSettings(false);
  }, []);

  // Cell click — write variables and fire action trigger
  const [, setSelectedEmployee] = useVariable(config.selectedEmployee);
  const [, setSelectedDate]     = useVariable(config.selectedDate);
  const triggerCellClick        = useActionTrigger(config.onCellClick);

  const handleCellClick = useCallback((employeeName, dateStr) => {
    console.log('[Scheduler] Cell clicked:', { employeeName, dateStr });
    if (config.selectedEmployee) setSelectedEmployee(employeeName ?? '');
    if (config.selectedDate)     setSelectedDate(dateStr ?? '');
    if (triggerCellClick)        triggerCellClick();
    console.log('[Scheduler] Variables set — employee:', config.selectedEmployee ? employeeName : '(not mapped)', '| date:', config.selectedDate ? dateStr : '(not mapped)', '| trigger:', triggerCellClick ? 'fired' : '(not mapped)');
  }, [config.selectedEmployee, config.selectedDate, setSelectedEmployee, setSelectedDate, triggerCellClick]);

  // Derive rows (empty array until data is ready)
  const rows = useMemo(() => {
    if (!data || !config.source) return [];
    const hasAllCols = REQUIRED_COLS.every(k => Boolean(config[k]));
    if (!hasAllCols) return [];
    const result = toRows(data, config);
    console.log('[Scheduler] Rows derived:', result.length, 'rows from source', config.source);
    return result;
  }, [data, config]);

  // Full color map: user-saved overrides + auto-generated for anything in the data
  const workTypeColors = useMemo(() => {
    const result = { ...settings.workTypeColors };
    for (const row of rows) {
      const wt = row.workTypeCol;
      if (wt && !result[wt]) result[wt] = stringToColor(wt);
    }
    return result;
  }, [rows, settings.workTypeColors]);

  // Legend-only map: only work types visible in the currently displayed range
  const visibleWorkTypeColors = useMemo(() => {
    const visibleDays = new Set();
    for (let w = 0; w < weekView; w++) {
      for (let d = 0; d < 5; d++) {
        visibleDays.add(formatDateStr(addDays(weekStart, w * 7 + d)));
      }
    }
    const result = {};
    for (const row of rows) {
      const wt = row.workTypeCol;
      if (!wt || result[wt]) continue;
      const startStr = parseDate(row.dateCol);
      if (!startStr) continue;
      const endStr = parseDate(row.endDateCol);
      if (expandDateRange(startStr, endStr).some(d => visibleDays.has(d))) {
        result[wt] = workTypeColors[wt] ?? stringToColor(wt);
      }
    }
    return result;
  }, [rows, weekStart, weekView, workTypeColors]);

  // ── Loading state gates ──────────────────────────────────────────────────
  const hasSource  = Boolean(config.source);
  const hasAllCols = REQUIRED_COLS.every(k => Boolean(config[k]));

  console.log('[Scheduler] Render — hasSource:', hasSource, '| hasAllCols:', hasAllCols, '| rows:', rows.length, '| editMode:', editMode, '| week:', formatDateStr(weekStart), '| weekView:', weekView);

  let gridContent;
  if (!hasSource) {
    gridContent = <EmptyState message="Select a data source in the editor panel." />;
  } else if (!hasAllCols) {
    gridContent = <EmptyState message="Configure all required columns in the editor panel." />;
  } else if (data == null) {
    gridContent = <EmptyState message="Loading data…" />;
  } else if (rows.length === 0) {
    gridContent = <EmptyState message="No data available for the configured columns." />;
  } else {
    gridContent = (
      <>
        <SchedulerHeader
          title={settings.title}
          weekStart={weekStart}
          weekView={weekView}
          workTypeColors={visibleWorkTypeColors}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onViewChange={handleViewChange}
        />
        <ViewTabs activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === 'Schedule' ? (
          <SchedulerGrid
            rows={rows}
            weekStart={weekStart}
            weekView={weekView}
            settings={{ ...settings, workTypeColors }}
            onCellClick={handleCellClick}
          />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9CA3AF',
            fontSize: 13,
            background: '#F4F6F9',
          }}>
            {activeTab} — Coming soon
          </div>
        )}
      </>
    );
  }

  // FAB and modal always render when editMode is on, regardless of loading state
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Inter, sans-serif',
      background: '#F4F6F9',
      position: 'relative',
    }}>
      {gridContent}

      {editMode && (
        <button
          onClick={() => setShowSettings(true)}
          title="Scheduler Settings"
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 1500,
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: '#0D1B2A',
            color: '#fff',
            border: '2px solid rgba(255,255,255,0.15)',
            fontSize: 20,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}
        >
          ⚙️
        </button>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

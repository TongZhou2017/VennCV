import { useEffect, useId, useRef, useState } from "react";
import { interpretDateText, todayIsoDate, type DateTextMeaning } from "../domain/projectTime";
import "./date-field.css";

type DateFieldProps = {
  ariaLabel: string;
  value: string | null;
  onChange: (next: string | null) => void;
  /** 预期完成可以留空；投稿时间点必须有日期。 */
  allowEmpty?: boolean;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function monthCells(year: number, month: number): string[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells: string[] = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    cells.push(todayIsoDate(day));
  }
  return cells;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const cursor = new Date(year, month + delta, 1);
  return { year: cursor.getFullYear(), month: cursor.getMonth() };
}

function yearChoices(selected: number): number[] {
  const start = Math.min(1990, selected);
  const end = Math.max(2100, selected);
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

function viewFromIso(iso: string): { year: number; month: number } {
  const [year, month] = iso.split("-").map(Number);
  return { year: year || new Date().getFullYear(), month: (month || 1) - 1 };
}

export function DateField({ ariaLabel, value, onChange, allowEmpty = true }: DateFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const initialView = viewFromIso(value || todayIsoDate());
  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  const placePopover = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 252;
    const height = 300;
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    setPlace({ top, left });
  };

  useEffect(() => {
    if (focused) return;
    setDraft(value ?? "");
  }, [focused, value]);

  useEffect(() => {
    if (!open) return;
    placePopover();
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onMove = () => placePopover();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const commitMeaning = (meaning: DateTextMeaning) => {
    switch (meaning.kind) {
      case "empty":
        if (allowEmpty) {
          onChange(null);
          setDraft("");
          setError("");
          return;
        }
        setDraft(value ?? "");
        setError("");
        return;
      case "invalid":
        setError("无法识别，可输入 2026-03-01、2026/3/1 或 2026年3月1日");
        return;
      case "date":
        onChange(meaning.iso);
        setDraft(meaning.iso);
        setError("");
        return;
      default: {
        const unexpected: never = meaning;
        setError(String(unexpected));
      }
    }
  };

  const openCalendar = () => {
    const meaning = interpretDateText(draft);
    const iso = meaning.kind === "date" ? meaning.iso : value || todayIsoDate();
    const view = viewFromIso(iso);
    setViewYear(view.year);
    setViewMonth(view.month);
    setOpen(true);
  };

  const chooseDate = (iso: string) => {
    onChange(iso);
    setDraft(iso);
    setError("");
    setOpen(false);
    const view = viewFromIso(iso);
    setViewYear(view.year);
    setViewMonth(view.month);
  };

  const cells = monthCells(viewYear, viewMonth);
  const monthKey = String(viewMonth + 1).padStart(2, "0");

  return (
    <div className="date-field" ref={rootRef}>
      <div className="date-field-row">
        <input
          className="date-field-input"
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? listId : undefined}
          inputMode="numeric"
          placeholder="2026-03-01"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitMeaning(interpretDateText(draft));
          }}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            setError("");
            const meaning = interpretDateText(next);
            if (meaning.kind === "date") onChange(meaning.iso);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitMeaning(interpretDateText(draft));
              setOpen(false);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openCalendar();
            }
          }}
        />
        <button
          type="button"
          className="date-field-open"
          aria-label={`${ariaLabel}日历`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) setOpen(false);
            else openCalendar();
          }}
        >
          日历
        </button>
      </div>
      {error ? (
        <p className="date-field-error" id={listId} role="alert">
          {error}
        </p>
      ) : !draft ? (
        <p className="date-field-hint">可直接输入 2026/3/1 或 2026年3月1日</p>
      ) : null}
      {open && place ? (
        <div className="date-popover" role="dialog" aria-label={`${ariaLabel}日历`} style={{ top: place.top, left: place.left }}>
          <div className="date-popover-bar">
            <button
              type="button"
              aria-label="上个月"
              onClick={() => {
                const next = shiftMonth(viewYear, viewMonth, -1);
                setViewYear(next.year);
                setViewMonth(next.month);
              }}
            >
              ‹
            </button>
            <select aria-label="年份" value={viewYear} onChange={(event) => setViewYear(Number(event.target.value))}>
              {yearChoices(viewYear).map((year) => (
                <option key={year} value={year}>
                  {year}年
                </option>
              ))}
            </select>
            <select
              aria-label="月份"
              value={viewMonth}
              onChange={(event) => setViewMonth(Number(event.target.value))}
            >
              {Array.from({ length: 12 }, (_, month) => (
                <option key={month} value={month}>
                  {month + 1}月
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="下个月"
              onClick={() => {
                const next = shiftMonth(viewYear, viewMonth, 1);
                setViewYear(next.year);
                setViewMonth(next.month);
              }}
            >
              ›
            </button>
          </div>
          <div className="date-popover-week">
            {WEEKDAYS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="date-popover-grid">
            {cells.map((iso) => {
              const day = Number(iso.slice(8));
              const inMonth = iso.slice(5, 7) === monthKey;
              const selected = iso === value;
              const today = iso === todayIsoDate();
              const className = [
                "date-day",
                inMonth ? "" : "is-outside",
                selected ? "is-selected" : "",
                today ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={iso}
                  type="button"
                  className={className}
                  aria-label={`${iso.slice(0, 4)}年${Number(iso.slice(5, 7))}月${day}日`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseDate(iso)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="date-popover-foot">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseDate(todayIsoDate())}>
              今天
            </button>
            {allowEmpty ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(null);
                  setDraft("");
                  setError("");
                  setOpen(false);
                }}
              >
                清除
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

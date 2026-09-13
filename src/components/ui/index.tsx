import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

/* ------------------------------- Icon ------------------------------- */

export function Icon({
  name,
  className,
  filled,
  size = 20,
  weight = 400,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
  weight?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn("msym select-none leading-none", className)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}

/* ------------------------------ Tooltip ----------------------------- */

export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const pos =
    side === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
      : side === "left"
        ? "right-full top-1/2 -translate-y-1/2 mr-2"
        : side === "right"
          ? "left-full top-1/2 -translate-y-1/2 ml-2"
          : "top-full left-1/2 -translate-x-1/2 mt-2";
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-[120] whitespace-nowrap rounded-[6px] bg-inverse-surface px-2 py-1 text-[11px] font-medium text-inverse-on-surface shadow-lg anim-fade",
            pos,
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/* ------------------------------ Buttons ----------------------------- */

type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger";

export function Button({
  variant = "filled",
  icon,
  trailingIcon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: string;
  trailingIcon?: string;
}) {
  const styles: Record<ButtonVariant, string> = {
    filled: "bg-primary text-on-primary",
    tonal: "bg-secondary-container text-on-secondary-container",
    outlined: "border border-outline text-primary bg-transparent",
    text: "text-primary bg-transparent",
    elevated: "bg-surf-low text-primary shadow-sm",
    danger: "bg-error text-on-error",
  };
  return (
    <button
      {...rest}
      className={cn(
        "state-layer inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium transition-[transform,background-color,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-38",
        styles[variant],
        className,
      )}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  selected,
  variant = "standard",
  size = 40,
  filled,
  className,
  tooltipSide = "bottom",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  selected?: boolean;
  variant?: "standard" | "filled" | "tonal" | "outlined";
  size?: number;
  filled?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}) {
  const styles =
    variant === "filled"
      ? selected
        ? "bg-primary text-on-primary"
        : "bg-surf-high text-on-surface-variant"
      : variant === "tonal"
        ? "bg-secondary-container text-on-secondary-container"
        : variant === "outlined"
          ? "border border-outline-variant text-on-surface-variant"
          : selected
            ? "text-primary bg-primary-container"
            : "text-on-surface-variant";
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        {...rest}
        aria-label={label}
        aria-pressed={selected}
        className={cn(
          "state-layer inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-38",
          styles,
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Icon name={icon} size={Math.round(size * 0.5)} filled={filled ?? selected} />
      </button>
    </Tooltip>
  );
}

export function Fab({
  icon,
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      {...rest}
      className={cn(
        "state-layer inline-flex h-14 items-center gap-3 rounded-[18px] bg-primary-container px-5 text-[15px] font-medium text-on-primary-container shadow-md transition active:scale-[0.98]",
        className,
      )}
    >
      <Icon name={icon} size={22} />
      {label}
    </button>
  );
}

/* ------------------------------- Chips ------------------------------ */

export function Chip({
  label,
  icon,
  selected,
  onClick,
  onRemove,
  className,
  disabled,
}: {
  label: string;
  icon?: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "state-layer inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors disabled:opacity-38",
        selected
          ? "bg-secondary-container text-on-secondary-container"
          : "border border-outline-variant text-on-surface-variant",
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} filled={selected} />}
      {label}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Usuń ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => e.key === "Enter" && onRemove()}
        >
          <Icon name="close" size={14} />
        </span>
      )}
    </button>
  );
}

export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  className,
  dense,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex overflow-hidden rounded-full border border-outline-variant",
        dense ? "h-8" : "h-10",
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "state-layer inline-flex flex-1 items-center justify-center gap-1.5 border-outline-variant px-3 text-[13px] font-medium transition-colors first:border-l-0 [&:not(:first-child)]:border-l",
              selected ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
            )}
          >
            {o.icon && <Icon name={o.icon} size={16} filled={selected} />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Tabs ------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex overflow-x-auto border-b border-outline-variant", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "state-layer relative inline-flex min-w-fit flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors",
              active ? "text-primary" : "text-on-surface-variant",
            )}
          >
            {t.icon && <Icon name={t.icon} size={18} filled={active} />}
            <span className="whitespace-nowrap">{t.label}</span>
            {active && (
              <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-primary transition-all" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Slider ------------------------------ */

export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onCommit,
  className,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  className?: string;
  label?: string;
}) {
  const ratio = max === min ? 0 : (value - min) / (max - min);
  return (
    <input
      type="range"
      className={cn("md-slider", className)}
      style={{ ["--val" as string]: String(Math.max(0, Math.min(1, ratio))) }}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={() => onCommit?.(value)}
      onKeyUp={() => onCommit?.(value)}
    />
  );
}

export function ParamRow({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  precision = 2,
  onChange,
  onReset,
  defaultValue = 0,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  precision?: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  defaultValue?: number;
}) {
  const id = useId();
  const changed = Math.abs(value - defaultValue) > 1e-6;
  return (
    <div className="group py-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-medium text-on-surface-variant">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            id={id}
            type="number"
            value={Number(value.toFixed(precision))}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
            }}
            className="h-6 w-16 rounded-[6px] bg-surf-high px-1.5 text-right font-mono text-[11px] text-on-surface outline-none focus:ring-1 focus:ring-primary"
          />
          {unit && <span className="w-5 text-[10px] text-on-surface-variant">{unit}</span>}
          <button
            type="button"
            aria-label={`Resetuj ${label}`}
            onClick={() => (onReset ? onReset() : onChange(defaultValue))}
            className={cn(
              "state-layer grid h-6 w-6 place-items-center rounded-full text-on-surface-variant transition-opacity",
              changed ? "opacity-100" : "opacity-0 group-hover:opacity-60",
            )}
          >
            <Icon name="restart_alt" size={14} />
          </button>
        </div>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} label={label} />
    </div>
  );
}

/* ------------------------------ Switch ------------------------------ */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "state-layer relative h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-38",
        checked
          ? "border-primary bg-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-primary)_35%,transparent)]"
          : "border-outline bg-surface-variant hover:border-on-surface-variant",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full shadow-sm transition-[left,background-color,transform] duration-200",
          checked ? "left-[25px] bg-on-primary" : "left-[3px] bg-outline",
        )}
      >
        {checked && <Icon name="check" size={13} className="text-primary" weight={600} />}
      </span>
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="state-layer flex items-center gap-2 rounded-lg py-1 pr-2 text-[13px] text-on-surface"
    >
      <span
        className={cn(
          "grid h-[18px] w-[18px] place-items-center rounded-[4px] border-2 transition-colors",
          checked ? "border-primary bg-primary" : "border-on-surface-variant",
        )}
      >
        {checked && <Icon name="check" size={14} className="text-on-primary" />}
      </span>
      {label}
    </button>
  );
}

/* ---------------------------- Text fields --------------------------- */

export function TextField({
  label,
  className,
  trailing,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; trailing?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-on-surface-variant">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1 rounded-[10px] bg-surf-high px-3 focus-within:ring-2 focus-within:ring-primary">
        <input
          id={id}
          {...rest}
          className="h-10 w-full bg-transparent text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/60"
        />
        {trailing}
      </div>
    </div>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-on-surface-variant">
          {label}
        </label>
      )}
      <div className="relative flex items-center rounded-[10px] bg-surf-high focus-within:ring-2 focus-within:ring-primary">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            const match = options.find((o) => String(o.value) === raw);
            onChange((match ? match.value : raw) as T);
          }}
          className="h-10 w-full appearance-none bg-transparent px-3 pr-9 text-[14px] text-on-surface outline-none"
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)} className="bg-surf text-on-surface">
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="expand_more" size={18} className="pointer-events-none absolute right-2 text-on-surface-variant" />
      </div>
    </div>
  );
}

/* ------------------------------- Menu ------------------------------- */

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  divider?: boolean;
  onSelect?: () => void;
}

export function Menu({
  items,
  trigger,
  align = "right",
}: {
  items: MenuItem[];
  trigger: (props: { onClick: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={wrapRef}>
      {trigger({ onClick: () => setOpen((v) => !v), ref })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-[110] mt-1 min-w-[220px] overflow-hidden rounded-[12px] bg-surf-high py-2 shadow-xl ring-1 ring-outline-variant anim-scale",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) =>
            item.divider ? (
              <div key={item.id} className="my-1 h-px bg-outline-variant" />
            ) : (
              <button
                key={item.id}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={cn(
                  "state-layer flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors disabled:opacity-38",
                  item.danger ? "text-error" : "text-on-surface",
                )}
              >
                {item.icon && <Icon name={item.icon} size={18} className="text-on-surface-variant" />}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="font-mono text-[10px] text-on-surface-variant">{item.shortcut}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Dialog ------------------------------ */

const DialogCtx = createContext<() => void>(() => undefined);
export const useDialogClose = () => useContext(DialogCtx);

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  actions,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]", xl: "max-w-[1040px]" };
  return createPortal(
    <DialogCtx.Provider value={onClose}>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/45 anim-fade"
          onClick={onClose}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] bg-surf-high shadow-2xl anim-scale",
            widths[size],
          )}
        >
          <div className="flex items-start gap-3 px-6 pt-6">
            {icon && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                <Icon name={icon} size={22} />
              </span>
            )}
            <h2 className="flex-1 pt-1.5 text-[22px] font-normal leading-tight text-on-surface">{title}</h2>
            <IconButton icon="close" label="Zamknij" onClick={onClose} size={36} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 text-[14px] text-on-surface-variant">{children}</div>
          {actions && <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-2">{actions}</div>}
        </div>
      </div>
    </DialogCtx.Provider>,
    document.body,
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[190] flex items-end">
      <div className="absolute inset-0 bg-black/40 anim-fade" onClick={onClose} aria-hidden />
      <div className="relative z-10 max-h-[80vh] w-full overflow-y-auto rounded-t-[28px] bg-surf-high pb-6 anim-sheet">
        <div className="sticky top-0 flex flex-col items-center gap-2 bg-surf-high pb-2 pt-3">
          <span className="h-1 w-8 rounded-full bg-outline-variant" />
          <div className="flex w-full items-center justify-between px-5">
            <h3 className="text-[16px] font-medium text-on-surface">{title}</h3>
            <IconButton icon="close" label="Zamknij" onClick={onClose} size={36} />
          </div>
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------- Feedback ----------------------------- */

export function LinearProgress({
  value,
  indeterminate,
  className,
}: {
  value?: number;
  indeterminate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-surface-variant", className)}>
      {indeterminate ? (
        <div className="h-full w-1/3 rounded-full bg-primary" style={{ animation: "md-indeterminate 1.4s infinite" }} />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%` }}
        />
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-[20px] bg-surf-high text-on-surface-variant",
          compact ? "h-12 w-12" : "h-16 w-16",
        )}
      >
        <Icon name={icon} size={compact ? 24 : 30} />
      </span>
      <div>
        <p className={cn("font-medium text-on-surface", compact ? "text-[13px]" : "text-[16px]")}>{title}</p>
        {description && (
          <p className={cn("mx-auto mt-1 max-w-[300px] text-on-surface-variant", compact ? "text-[11px]" : "text-[13px]")}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function SectionHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1 pt-3">
      {icon && <Icon name={icon} size={16} className="text-on-surface-variant" />}
      <h4 className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{title}</h4>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
  onClick,
  selected,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-[14px] bg-surf-low text-left transition-all duration-150",
        onClick && "state-layer hover:shadow-sm",
        selected && "ring-2 ring-primary",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

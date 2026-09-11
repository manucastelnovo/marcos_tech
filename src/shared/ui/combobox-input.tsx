"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A text input that suggests known values without ever refusing an unknown one.
 *
 * A closed dropdown is a trap at a repair counter: the moment a device is not
 * in the catalogue, intake stops. Here the catalogue is a shortcut, and typing
 * a new value is always valid.
 */
export function ComboboxInput({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    const pool = query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options;
    return pool.slice(0, 20);
  }, [options, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || matches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      // Enter picks the highlighted suggestion. Ctrl+Enter is reserved for
      // submitting the whole form, so it is deliberately let through.
      event.preventDefault();
      onChange(matches[highlighted]);
      setIsOpen(false);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            onChange(event.target.value);
            // Reset here rather than in an effect: the highlight follows typing,
            // and a synchronous setState inside an effect cascades renders.
            setHighlighted(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {isOpen && matches.length > 0 ? (
          <ul className="bg-popover absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-md border shadow-md">
            {matches.map((option, index) => (
              <li key={option}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm",
                    index === highlighted ? "bg-accent" : "hover:bg-accent/60",
                  )}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

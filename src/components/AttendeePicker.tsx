"use client";

import { useEffect, useRef, useState } from "react";

interface Contact {
  id: string;
  email: string;
  name: string | null;
}

interface Props {
  selected: string[];
  onChange: (emails: string[]) => void;
}

export default function AttendeePicker({ selected, onChange }: Props) {
  const [favorites, setFavorites] = useState<Contact[]>([]);
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setFavorites(d.contacts ?? []));
  }, []);

  const filtered = favorites.filter(
    (c) =>
      !selected.includes(c.email) &&
      (c.email.toLowerCase().includes(input.toLowerCase()) ||
        (c.name ?? "").toLowerCase().includes(input.toLowerCase()))
  );

  function addEmail(email: string) {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes("@") || selected.includes(clean)) return;
    onChange([...selected, clean]);
    setInput("");
    setShowDropdown(false);
  }

  function removeEmail(email: string) {
    onChange(selected.filter((e) => e !== email));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(input);
    }
    if (e.key === "Backspace" && input === "" && selected.length > 0) {
      onChange(selected.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((email) => {
            const contact = favorites.find((c) => c.email === email);
            return (
              <span
                key={email}
                className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
              >
                {contact?.name ?? email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="text-blue-500 hover:text-blue-800 leading-none font-bold ml-0.5"
                >
                  &times;
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Add email or pick from favorites…"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />

        {showDropdown && (filtered.length > 0 || (input.includes("@") && !selected.includes(input.trim()))) && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden">
            {/* Typed email as quick-add option */}
            {input.includes("@") && !selected.includes(input.trim()) && (
              <button
                type="button"
                onMouseDown={() => addEmail(input)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-slate-50"
              >
                <span className="text-blue-600 font-medium">Add</span>
                <span className="text-slate-700 truncate">{input.trim()}</span>
              </button>
            )}
            {/* Favorites matches */}
            {filtered.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => addEmail(c.email)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(c.name ?? c.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  {c.name && <p className="font-medium text-slate-800 truncate">{c.name}</p>}
                  <p className="text-slate-500 truncate">{c.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">Press Enter or comma to add. Manage favorites in Preferences.</p>
    </div>
  );
}

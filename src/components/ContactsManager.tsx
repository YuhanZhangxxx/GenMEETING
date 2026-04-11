"use client";

import { useEffect, useState } from "react";

interface Contact {
  id: string;
  email: string;
  name: string | null;
}

export default function ContactsManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Enter a valid email"); return; }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEmail("");
      setName("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(contactEmail: string) {
    await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: contactEmail }),
    });
    setContacts((prev) => prev.filter((c) => c.email !== contactEmail));
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-slate-500 block mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alice@example.com"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>
        <div className="w-32">
          <label className="text-xs text-slate-500 block mb-1">Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {adding ? "..." : "+ Add"}
        </button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No favorite contacts yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(c.name ?? c.email)[0].toUpperCase()}
                </div>
                <div>
                  {c.name && <p className="text-sm font-medium text-slate-800">{c.name}</p>}
                  <p className="text-xs text-slate-500">{c.email}</p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.email)}
                className="text-slate-300 hover:text-red-500 text-lg leading-none font-bold transition-colors"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

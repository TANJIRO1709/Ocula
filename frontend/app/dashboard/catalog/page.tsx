"use client";

import { useEffect, useState } from "react";
import { DashShell } from "@/components/DashShell";
import { api } from "@/lib/api";

type Item = { sku: string; category: string; family: string; name: string; description: string; lens_index: number | null; tags: string[]; attrs: Record<string, any>; price_inr: number | null; active: boolean };
const EMPTY: Item = { sku: "", category: "coating", family: "", name: "", description: "", lens_index: null, tags: [], attrs: {}, price_inr: null, active: true };

export default function CatalogPage() {
  return <DashShell>{(staff) => <Catalog canEdit={staff.user.role !== "staff"} />}</DashShell>;
}

function Catalog({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [edit, setEdit] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Item[]>("/catalog").then(setItems).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!edit) return;
    setErr(null);
    try {
      if (isNew) await api("/catalog", { body: edit });
      else await api(`/catalog/${edit.sku}`, { method: "PUT", body: edit });
      setEdit(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const groups = ["design", "material", "coating", "feature", "frame"];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div><p className="label">Store catalog</p><h1 className="font-display text-3xl font-semibold">Lenses &amp; frames</h1>
          <p className="text-sm text-slate-500">The rules engine recommends by SKU; edit names, prices and availability here. Verify product names with your ZEISS representative.</p></div>
        {canEdit && <button className="btn-primary" onClick={() => { setEdit({ ...EMPTY }); setIsNew(true); }}>+ Add item</button>}
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      {groups.map((g) => (
        <section key={g} className="card overflow-hidden">
          <h2 className="bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-500">{g}</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              {items.filter((i) => i.category === g).map((i) => (
                <tr key={i.sku} className={`border-t ${i.active ? "" : "opacity-40"}`}>
                  <td className="w-32 p-3 font-mono text-xs">{i.sku}</td>
                  <td className="p-3"><div className="font-semibold">{i.name}</div><div className="text-xs text-slate-500">{i.family}{i.lens_index ? ` · n=${i.lens_index}` : ""}{g === "frame" ? ` · ${i.attrs.shape} ${i.attrs.a}-${i.attrs.dbl} B${i.attrs.b}` : ""}</div></td>
                  <td className="w-28 p-3">{i.price_inr ? `₹${i.price_inr.toLocaleString("en-IN")}` : <span className="text-slate-400">set price</span>}</td>
                  <td className="w-40 p-3 text-right">
                    {canEdit && <button className="text-teal underline" onClick={() => { setEdit({ ...i }); setIsNew(false); }}>Edit</button>}
                    {canEdit && i.active && <button className="ml-3 text-slate-500 underline" onClick={async () => { await api(`/catalog/${i.sku}`, { method: "DELETE" }); load(); }}>Disable</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {edit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="card w-full max-w-lg space-y-3 p-5">
            <h2 className="font-display text-xl font-semibold">{isNew ? "Add item" : `Edit ${edit.sku}`}</h2>
            <div className="grid grid-cols-2 gap-3">
              <input className="input" placeholder="SKU" value={edit.sku} disabled={!isNew} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} aria-label="SKU" />
              <select className="input" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} aria-label="Category">
                {groups.map((g) => <option key={g}>{g}</option>)}
              </select>
              <input className="input col-span-2" placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Name" />
              <input className="input" placeholder="Family" value={edit.family} onChange={(e) => setEdit({ ...edit, family: e.target.value })} aria-label="Family" />
              <input className="input" placeholder="Price ₹" type="number" value={edit.price_inr ?? ""} onChange={(e) => setEdit({ ...edit, price_inr: e.target.value ? Number(e.target.value) : null })} aria-label="Price" />
              <input className="input" placeholder="Lens index" type="number" step="0.01" value={edit.lens_index ?? ""} onChange={(e) => setEdit({ ...edit, lens_index: e.target.value ? Number(e.target.value) : null })} aria-label="Lens index" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
              <textarea className="input col-span-2" rows={3} placeholder="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} aria-label="Description" />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

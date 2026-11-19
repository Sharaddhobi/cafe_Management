import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function ModifierModal({ dish, onClose, onConfirm }) {
  const [selectedMods, setSelectedMods] = useState([]);
  const [note, setNote] = useState('');

  const availableMods = Array.isArray(dish.modifiers) ? dish.modifiers : [];

  const toggleMod = (modName) => {
    setSelectedMods((prev) =>
      prev.includes(modName) ? prev.filter((m) => m !== modName) : [...prev, modName]
    );
  };

  const extraPrice = availableMods
    .filter((m) => selectedMods.includes(m.name))
    .reduce((sum, m) => sum + Number(m.price || 0), 0);

  const extraCogs = availableMods
    .filter((m) => selectedMods.includes(m.name))
    .reduce((sum, m) => sum + Number(m.cogs || 0), 0);

  const finalPrice = Number(dish.price) + extraPrice;

  const handleAdd = () => {
    const cleanMods = [...selectedMods].sort();
    const cleanNote = note.trim();
    const lineKey = `${dish.id}|${cleanMods.join(',')}|${cleanNote}`;

    onConfirm({
      id: dish.id,
      line_key: lineKey,
      name: dish.name,
      price: finalPrice,
      recipe_cost: Number(dish.recipe_cost) + extraCogs,
      station: dish.station,
      qty: 1,
      selected_modifiers: cleanMods,
      note: cleanNote
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">{dish.name}</h3>
            <p className="text-xs text-slate-500">Base price ₹{dish.price}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {availableMods.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-slate-500">Customize Add-Ons</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {availableMods.map((mod) => {
                const checked = selectedMods.includes(mod.name);
                return (
                  <button
                    key={mod.name}
                    type="button"
                    onClick={() => toggleMod(mod.name)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
                      checked
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{mod.name}</span>
                    <span className="font-bold">
                      {Number(mod.price) > 0 ? `+₹${mod.price}` : 'Free'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Kitchen Note <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            maxLength={120}
            placeholder="e.g., Extra hot, no sugar, serve with tissues"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 outline-none"
          />
        </div>

        <button
          onClick={handleAdd}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" />
          Add Item — ₹{finalPrice}
        </button>
      </div>
    </div>
  );
}
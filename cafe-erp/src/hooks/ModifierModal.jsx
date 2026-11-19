// import React, { useState } from 'react';
// import { Plus, X } from 'lucide-react';

// export default function ModifierModal({ dish, onClose, onConfirm }) {
//   const [selectedMods, setSelectedMods] = useState([]);
//   const [note, setNote] = useState('');

//   const availableMods = Array.isArray(dish.modifiers) ? dish.modifiers : [];

//   const toggleMod = (modName) => {
//     setSelectedMods((prev) =>
//       prev.includes(modName) ? prev.filter((m) => m !== modName) : [...prev, modName]
//     );
//   };

//   const extraPrice = availableMods
//     .filter((m) => selectedMods.includes(m.name))
//     .reduce((sum, m) => sum + Number(m.price || 0), 0);

//   const extraCogs = availableMods
//     .filter((m) => selectedMods.includes(m.name))
//     .reduce((sum, m) => sum + Number(m.cogs || 0), 0);

//   const finalPrice = Number(dish.price) + extraPrice;

//   const handleAdd = () => {
//     const cleanMods = [...selectedMods].sort();
//     const cleanNote = note.trim();
//     const lineKey = `${dish.id}|${cleanMods.join(',')}|${cleanNote}`;

//     onConfirm({
//       id: dish.id,
//       line_key: lineKey,
//       name: dish.name,
//       price: finalPrice,
//       recipe_cost: Number(dish.recipe_cost) + extraCogs,
//       station: dish.station,
//       qty: 1,
//       selected_modifiers: cleanMods,
//       note: cleanNote
//     });
//   };

//   return (
//     <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50">
//       <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
//         <div className="flex items-start justify-between gap-2">
//           <div>
//             <h3 className="font-extrabold text-base text-slate-900">{dish.name}</h3>
//             <p className="text-xs text-slate-500">Base price ₹{dish.price}</p>
//           </div>
//           <button
//             onClick={onClose}
//             className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
//           >
//             <X className="w-4 h-4" />
//           </button>
//         </div>

//         {availableMods.length > 0 && (
//           <div className="space-y-2">
//             <p className="text-xs font-bold uppercase text-slate-500">Customize Add-Ons</p>
//             <div className="space-y-1.5 max-h-44 overflow-y-auto">
//               {availableMods.map((mod) => {
//                 const checked = selectedMods.includes(mod.name);
//                 return (
//                   <button
//                     key={mod.name}
//                     type="button"
//                     onClick={() => toggleMod(mod.name)}
//                     className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
//                       checked
//                         ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
//                         : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
//                     }`}
//                   >
//                     <span>{mod.name}</span>
//                     <span className="font-bold">
//                       {Number(mod.price) > 0 ? `+₹${mod.price}` : 'Free'}
//                     </span>
//                   </button>
//                 );
//               })}
//             </div>
//           </div>
//         )}

//         <div>
//           <label className="block text-xs font-bold text-slate-700 mb-1">
//             Kitchen Note <span className="text-slate-400 font-normal">(Optional)</span>
//           </label>
//           <input
//             maxLength={120}
//             placeholder="e.g., Extra hot, no sugar, serve with tissues"
//             value={note}
//             onChange={(e) => setNote(e.target.value)}
//             className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 outline-none"
//           />
//         </div>

//         <button
//           onClick={handleAdd}
//           className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 shadow"
//         >
//           <Plus className="w-4 h-4" />
//           Add Item — ₹{finalPrice}
//         </button>
//       </div>
//     </div>
//   );
// }


import React, { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

export default function ModifierModal({ dish, onClose, onConfirm }) {
  const [selectedMods, setSelectedMods] = useState([]);
  const [note, setNote] = useState('');

  const availableMods = Array.isArray(dish.modifiers) ? dish.modifiers : [];

  const toggleMod = (modName) => {
      triggerHaptic('light');
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
      triggerHaptic('medium');
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
      <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-md flex items-end sm:items-center justify-center p-3 z-50">
          <div className="liquid-glass rounded-[32px] max-w-sm w-full p-5 space-y-4">
              {/* Grabber handle on mobile */}
              <div className="w-10 h-1 rounded-full bg-slate-400/50 mx-auto sm:hidden" />

        <div className="flex items-start justify-between gap-2">
          <div>
                      <h3 className="font-bold text-lg tracking-tight text-slate-900">{dish.name}</h3>
                      <p className="text-xs font-medium text-slate-500">Base price ₹{dish.price}</p>
          </div>
          <button
                      onClick={() => {
                          triggerHaptic('light');
                          onClose();
                      }}
                      className="tactile w-8 h-8 rounded-full bg-slate-900/10 hover:bg-slate-900/15 flex items-center justify-center text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {availableMods.length > 0 && (
          <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Customize Add-Ons
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
              {availableMods.map((mod) => {
                const checked = selectedMods.includes(mod.name);
                return (
                  <button
                    key={mod.name}
                    type="button"
                    onClick={() => toggleMod(mod.name)}
                        className={`tactile w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold border transition ${
                      checked
                        ? 'bg-[#007AFF]/12 border-[#007AFF] text-[#0051A8] shadow-sm'
                        : 'bg-white/65 border-white/80 text-slate-800 hover:bg-white/85'
                    }`}
                  >
                        <span className="flex items-center gap-2">
                            <span
                                className={`w-4 h-4 rounded-full flex items-center justify-center border ${checked
                                        ? 'bg-[#007AFF] border-[#007AFF] text-white'
                                        : 'border-slate-300 bg-white/80'
                                    }`}
                            >
                                {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                            {mod.name}
                        </span>
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
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Kitchen Note <span className="normal-case font-normal">(Optional)</span>
          </label>
          <input
            maxLength={120}
                      placeholder="e.g., Extra hot, less ice, no sugar"
            value={note}
            onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/70 border border-white/90 rounded-2xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#007AFF] outline-none shadow-inner"
          />
        </div>

        <button
          onClick={handleAdd}
                  className="tactile w-full bg-[#007AFF] hover:bg-[#0066D6] text-white font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-1.5 shadow-[0_10px_24px_rgba(0,122,255,0.35)]"
        >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
          Add Item — ₹{finalPrice}
        </button>
      </div>
    </div>
  );
}
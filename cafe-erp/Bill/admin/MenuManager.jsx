import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function MenuManager({ menu, onAdd, onToggleStock, onDelete }) {
  const [form, setForm] = useState({
    name: '',
    category: 'Coffee',
    price: '',
    recipeCost: '',
    station: 'Barista',
    dietary: 'Veg',
    prepTime: '5',
    description: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.recipeCost) return;
    setSaving(true);
    try {
      await onAdd(form);
      setForm({
        name: '',
        category: 'Coffee',
        price: '',
        recipeCost: '',
        station: 'Barista',
        dietary: 'Veg',
        prepTime: '5',
        description: ''
      });
    } catch (err) {
      alert('Failed to add dish: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add New Dish Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">Add New Menu Item</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            required
            placeholder="Dish Name (e.g., Cold Brew)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-600 outline-none"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option>Coffee</option>
            <option>Food</option>
            <option>Beverages</option>
            <option>Desserts</option>
          </select>
          <input
            required
            type="number"
            min="1"
            placeholder="Selling Price (₹)"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-600 outline-none"
          />
          <input
            required
            type="number"
            min="1"
            placeholder="Recipe Cost / COGS (₹)"
            value={form.recipeCost}
            onChange={(e) => setForm({ ...form, recipeCost: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-600 outline-none"
          />
          <select
            value={form.station}
            onChange={(e) => setForm({ ...form, station: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option>Barista</option>
            <option>Hot Kitchen</option>
          </select>
          <select
            value={form.dietary}
            onChange={(e) => setForm({ ...form, dietary: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option>Veg</option>
            <option>Jain</option>
            <option>Vegan</option>
            <option>Non-Veg</option>
          </select>
          <input
            type="number"
            min="1"
            placeholder="Est. Prep Mins"
            value={form.prepTime}
            onChange={(e) => setForm({ ...form, prepTime: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
          />
          <input
            placeholder="Short Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
          />
        </div>

        <button
          disabled={saving}
          type="submit"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          {saving ? 'Saving to Cloud...' : 'Add Dish to Live Menu'}
        </button>
      </form>

      {/* Live Menu Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Dish & Station</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Recipe COGS</th>
              <th className="px-4 py-3">Food Cost %</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {menu.map((item) => {
              const costPct = Math.round((Number(item.recipe_cost) / Number(item.price)) * 100);
              const badgeColor =
                costPct > 35
                  ? 'bg-rose-100 text-rose-700'
                  : costPct > 32
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-700';

              return (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.station} • {item.dietary} • ~{item.prep_time}m
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.category}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">₹{item.price}</td>
                  <td className="px-4 py-3 text-slate-600">₹{item.recipe_cost}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                      {costPct}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleStock(item.id, item.in_stock)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        item.in_stock
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}
                    >
                      {item.in_stock ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> In Stock
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" /> Sold Out (86)
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(item.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="Delete Dish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
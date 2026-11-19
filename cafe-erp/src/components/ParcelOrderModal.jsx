import React, { useState } from 'react';
import { Package, Plus, Minus, X, Send } from 'lucide-react';
import ModifierModal from './ModifierModal';

export default function ParcelOrderModal({ menu, onClose, onCreateParcel }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cart, setCart] = useState([]);
  const [customizingDish, setCustomizingDish] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const addItem = (itemObj) => {
    const key = itemObj.line_key || String(itemObj.id);
    setCart((prev) => {
      const existing = prev.find((i) => (i.line_key || String(i.id)) === key);
      if (existing) {
        return prev.map((i) =>
          (i.line_key || String(i.id)) === key ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, itemObj];
    });
  };

  const updateQty = (key, delta) => {
    setCart((prev) =>
      prev
        .map((i) => ((i.line_key || String(i.id)) === key ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const subtotal = cart.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
  const totalWithGst = Math.round(subtotal * 1.05);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || cart.length === 0) return;
    setSubmitting(true);
    try {
      await onCreateParcel({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: cart
      });
      onClose();
    } catch (err) {
      alert('Failed to create parcel order: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-xl text-white">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                New Walk-In Parcel / Takeaway Order
              </h3>
              <p className="text-xs text-slate-500">
                Sends directly to Kitchen KDS with a PARCEL packaging tag
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto flex-1">
          {/* Left: Menu Picker */}
          <div className="space-y-2 border border-slate-200 rounded-2xl p-3 max-h-80 overflow-y-auto">
            <p className="text-xs font-extrabold uppercase text-slate-500">Tap Items to Pack</p>
            {menu
              .filter((m) => m.in_stock)
              .map((dish) => {
                const hasMods = Array.isArray(dish.modifiers) && dish.modifiers.length > 0;
                return (
                  <button
                    key={dish.id}
                    type="button"
                    onClick={() => {
                      if (hasMods) {
                        setCustomizingDish(dish);
                      } else {
                        addItem({
                          id: dish.id,
                          line_key: String(dish.id),
                          name: dish.name,
                          price: Number(dish.price),
                          recipe_cost: Number(dish.recipe_cost),
                          station: dish.station,
                          qty: 1,
                          selected_modifiers: [],
                          note: ''
                        });
                      }
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 text-left text-xs transition"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{dish.name}</p>
                      <p className="text-[11px] text-slate-500">
                        ₹{dish.price} {hasMods ? '• Customizable' : ''}
                      </p>
                    </div>
                    <span className="bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded-lg">
                      + Add
                    </span>
                  </button>
                );
              })}
          </div>

          {/* Right: Customer Details & Cart */}
          <div className="space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  placeholder="e.g., Rohan (Takeaway)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  WhatsApp Phone <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-purple-600"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 max-h-40 overflow-y-auto space-y-2">
                {cart.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No items added yet.</p>
                ) : (
                  cart.map((item) => {
                    const key = item.line_key || String(item.id);
                    return (
                      <div key={key} className="flex items-center justify-between text-xs gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{item.name}</p>
                          {item.selected_modifiers?.length > 0 && (
                            <p className="text-[10px] text-purple-700">
                              + {item.selected_modifiers.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQty(key, -1)}
                            className="p-1 bg-white border border-slate-200 rounded"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold w-4 text-center">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(key, 1)}
                            className="p-1 bg-white border border-slate-200 rounded"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-xs font-extrabold text-slate-900">
                <span>Total (incl. 5% GST)</span>
                <span className="text-purple-700 text-sm">₹{totalWithGst}</span>
              </div>
              <button
                disabled={submitting || cart.length === 0}
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Sending to Kitchen...' : 'Send Parcel to Kitchen Now'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {customizingDish && (
        <ModifierModal
          dish={customizingDish}
          onClose={() => setCustomizingDish(null)}
          onConfirm={(customizedItem) => {
            addItem(customizedItem);
            setCustomizingDish(null);
          }}
        />
      )}
    </div>
  );
}
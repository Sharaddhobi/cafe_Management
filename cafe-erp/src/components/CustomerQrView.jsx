import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Minus,
  Clock,
  Send,
  ShoppingBag,
  User,
  Phone,
  Lock,
  Sparkles,
  Bell,
  Droplets,
  Receipt,
  Check
} from 'lucide-react';
import ModifierModal from './ModifierModal';
import TicTacToeGame from './TicTacToeGame';
import QrSplash from './QrSplash';
import { CAFE_CONFIG } from '../config/cafeConfig';
import { triggerHaptic } from '../utils/haptics';

function formatTimer(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function CustomerQrView({
  menu,
  tables,
  orders,
  now,
  lockedTableNumber,
  lockedQrToken,
  alerts = [],
  onSendAlert,
  onPlaceGraceOrder,
  onUpdateGraceItems,
  onCancelGraceOrder,
  onLockOrderNow
}) {
  const [selectedTable, setSelectedTable] = useState(
    lockedTableNumber !== null ? lockedTableNumber : 1
  );
  const [showSplash, setShowSplash] = useState(lockedTableNumber !== null);
  const [headerLogoMissing, setHeaderLogoMissing] = useState(false);

  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [customizingDish, setCustomizingDish] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [sendingAlert, setSendingAlert] = useState(null);
  const [myParcelOrderIds, setMyParcelOrderIds] = useState([]);

  useEffect(() => {
    if (lockedTableNumber !== null) {
      setSelectedTable(lockedTableNumber);
      setShowSplash(true);
    }
  }, [lockedTableNumber]);

  const isParcelMode = Number(selectedTable) === 0;

  const currentTableInfo = useMemo(
    () => tables.find((t) => Number(t.table_number) === Number(selectedTable)),
    [tables, selectedTable]
  );

  const activeGraceOrder = useMemo(
    () =>
      orders.find((o) => {
        if (o.status !== 'Grace_Period') return false;
        if (isParcelMode) return myParcelOrderIds.includes(o.id);
        return Number(o.table_number) === Number(selectedTable);
      }),
    [orders, selectedTable, isParcelMode, myParcelOrderIds]
  );

  const tableRunningOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (o.paid || o.status === 'Cancelled') return false;
        if (isParcelMode) return myParcelOrderIds.includes(o.id);
        return Number(o.table_number) === Number(selectedTable);
      }),
    [orders, selectedTable, isParcelMode, myParcelOrderIds]
  );

  const runningBillTotal = useMemo(() => {
    const subtotal = tableRunningOrders.reduce(
      (sum, ord) =>
        sum + (ord.items || []).reduce((s, item) => s + Number(item.price) * item.qty, 0),
      0
    );
    const gst = Math.round(subtotal * 0.05);
    return { subtotal, gst, grandTotal: subtotal + gst };
  }, [tableRunningOrders]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const graceRemainingMs = activeGraceOrder ? Number(activeGraceOrder.grace_ends_at) - now : 0;
  const isFinalizingBuffer = activeGraceOrder && graceRemainingMs <= 2000;

  const commitAddItem = async (itemObj) => {
    const key = itemObj.line_key || String(itemObj.id);

    if (activeGraceOrder) {
      if (isFinalizingBuffer) {
        triggerHaptic('error');
        showToast('Locking to kitchen now. You can add another order in 2s.');
        return;
      }
      const existing = activeGraceOrder.items.find(
        (i) => (i.line_key || String(i.id)) === key
      );
      const updatedItems = existing
        ? activeGraceOrder.items.map((i) =>
            (i.line_key || String(i.id)) === key ? { ...i, qty: i.qty + 1 } : i
          )
        : [...activeGraceOrder.items, itemObj];

      const ok = await onUpdateGraceItems(activeGraceOrder.id, updatedItems);
      if (!ok) {
        triggerHaptic('error');
        showToast('Edit window just closed - order is now with the Chef.');
      } else {
        triggerHaptic('success');
      }
      return;
    }

    triggerHaptic('light');
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

  const handleDishClick = (dish) => {
    if (!dish.in_stock) return;
    triggerHaptic('light');
    if (Array.isArray(dish.modifiers) && dish.modifiers.length > 0) {
      setCustomizingDish(dish);
      return;
    }
    commitAddItem({
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
  };

  const handleUpdateCartQty = (lineKey, delta) => {
    triggerHaptic('light');
    setCart((prev) =>
      prev
        .map((i) =>
          (i.line_key || String(i.id)) === lineKey ? { ...i, qty: i.qty + delta } : i
        )
        .filter((i) => i.qty > 0)
    );
  };

  const handleUpdateGraceQty = async (lineKey, delta) => {
    if (!activeGraceOrder || isFinalizingBuffer) return;
    triggerHaptic('light');

    const updatedItems = activeGraceOrder.items
      .map((i) =>
        (i.line_key || String(i.id)) === lineKey ? { ...i, qty: i.qty + delta } : i
      )
      .filter((i) => i.qty > 0);

    if (updatedItems.length === 0) {
      const cancelled = await onCancelGraceOrder(activeGraceOrder.id);
      triggerHaptic(cancelled ? 'medium' : 'error');
      showToast(
        cancelled
          ? 'Order cancelled before reaching the kitchen.'
          : 'Too late - order already locked to Kitchen.'
      );
      return;
    }

    const ok = await onUpdateGraceItems(activeGraceOrder.id, updatedItems);
    if (!ok) {
      triggerHaptic('error');
      showToast('Edit window closed - order is locked to Kitchen.');
    }
  };

  const handleConfirmPlaceOrder = async (e) => {
    e.preventDefault();
    setCheckoutError('');

    if (!guestName.trim()) {
      triggerHaptic('error');
      setCheckoutError('Please enter your name so staff can call your order.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await onPlaceGraceOrder({
        tableNumber: selectedTable,
        qrToken: lockedQrToken || currentTableInfo?.qr_token || '',
        standeePin: isParcelMode ? '00' : enteredPin.trim(),
        customerName: guestName,
        customerPhone: guestPhone,
        items: cart,
        orderType: isParcelMode ? 'Parcel' : 'Dine-In'
      });
      if (isParcelMode && created?.id) {
        setMyParcelOrderIds((prev) => [...prev, created.id]);
      }
      triggerHaptic('success');
      setCart([]);
      setShowCheckoutModal(false);
      setEnteredPin('');
      showToast('Order placed! 60-second edit window active.');
    } catch (err) {
      triggerHaptic('error');
      setCheckoutError(err.message || 'Failed to place order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`max-w-md mx-auto min-h-[88vh] rounded-[36px] overflow-hidden pb-32 relative shadow-[0_24px_70px_-15px_rgba(15,23,42,0.18)] border border-white/70 ${
        isParcelMode ? 'liquid-canvas-parcel' : 'liquid-canvas-dinein'
      }`}
    >
      {/* QR SCAN LOGO SPLASH ANIMATION */}
      {showSplash && (
        <QrSplash tableNumber={selectedTable} onFinish={() => setShowSplash(false)} />
      )}

      {/* FLOATING LIQUID GLASS HEADER WITH CAFE LOGO */}
      <div className="sticky top-0 z-20 p-3 pb-1">
        <div className="liquid-glass rounded-[26px] px-3.5 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {!headerLogoMissing && (
              <img
                src={CAFE_CONFIG.logoUrl}
                alt={CAFE_CONFIG.name}
                onError={() => setHeaderLogoMissing(true)}
                className="w-11 h-11 rounded-2xl object-contain bg-white/85 p-1 border border-white shadow-sm shrink-0"
              />
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full text-white shadow-sm ${
                    isParcelMode
                      ? 'bg-gradient-to-r from-[#5856D6] to-[#007AFF]'
                      : 'bg-[#007AFF]'
                  }`}
                >
                  {isParcelMode ? 'PARCEL TO-GO' : `TABLE #${selectedTable}`}
                </span>
                {lockedTableNumber !== null && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-500/12 px-2 py-0.5 rounded-full">
                    <Lock className="w-2.5 h-2.5" /> Verified
                  </span>
                )}
              </div>
              <h2 className="font-bold text-[15px] tracking-tight text-slate-900 mt-1 truncate">
                {CAFE_CONFIG.name}
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                {isParcelMode ? 'Fresh Menu & Pack To-Go' : CAFE_CONFIG.tagline}
              </p>
            </div>
          </div>

          {lockedTableNumber === null && (
            <select
              value={selectedTable}
              onChange={(e) => {
                triggerHaptic('light');
                setSelectedTable(Number(e.target.value));
              }}
              className="liquid-pill text-slate-800 text-xs font-semibold px-2.5 py-1.5 rounded-full outline-none cursor-pointer shrink-0"
            >
              {tables.map((t) => (
                <option key={t.table_number} value={t.table_number}>
                  {Number(t.table_number) === 0 ? 'Parcel' : `Table #${t.table_number}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* FLOATING TOAST */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 liquid-glass-dark text-white text-xs font-semibold px-5 py-2.5 rounded-full shadow-2xl whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* QUICK SERVICE GLASS PILLS (1-TAP LOCKED UNTIL RESOLVED) */}
      {!isParcelMode && (
        <div className="grid grid-cols-3 gap-2 px-3.5 pt-2">
          {[
            { label: 'Call Waiter', sentText: 'Waiter Sent', icon: Bell },
            { label: 'Need Water', sentText: 'Water Sent', icon: Droplets },
            { label: 'Request Bill', sentText: 'Bill Sent', icon: Receipt }
          ].map(({ label, sentText, icon: Icon }) => {
            const isActive = alerts.some(
              (a) =>
                Number(a.table_number) === Number(selectedTable) &&
                a.alert_type === label
            );
            const isBusy = sendingAlert === label;

            return (
              <button
                key={label}
                disabled={isActive || isBusy}
                onClick={async () => {
                  if (isActive || isBusy) return;
                  triggerHaptic('medium');
                  setSendingAlert(label);
                  try {
                    await onSendAlert(selectedTable, label);
                    triggerHaptic('success');
                    showToast(`Sent "${label}" to staff`);
                  } catch (err) {
                    triggerHaptic('error');
                    showToast('Alert failed: ' + err.message);
                  } finally {
                    setSendingAlert(null);
                  }
                }}
                className={`tactile rounded-2xl py-2.5 px-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-[0_6px_16px_rgba(16,185,129,0.3)] cursor-default'
                    : 'liquid-pill text-slate-800 hover:bg-white/90 disabled:opacity-60'
                }`}
              >
                {isActive ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    {sentText}
                  </>
                ) : (
                  <>
                    <Icon className="w-3.5 h-3.5 text-[#007AFF]" />
                    {isBusy ? 'Sending...' : label}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 60-SECOND EDIT WINDOW GLASS CARD */}
      {activeGraceOrder && (
        <div className="mx-3.5 mt-3 p-4 rounded-[28px] liquid-glass border-amber-300/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">
                  {isFinalizingBuffer ? 'Sending to Kitchen...' : '1-Min Edit Window'}
                </h3>
                <p className="text-[11px] text-slate-600">
                  {isFinalizingBuffer
                    ? 'Finalizing ticket now'
                    : 'Tap menu to add, adjust qty, or cancel'}
                </p>
              </div>
            </div>
            <div className="bg-slate-900 text-white font-mono font-bold text-sm px-3 py-1.5 rounded-full shadow">
              {formatCountdown(graceRemainingMs)}
            </div>
          </div>

          <div className="bg-white/65 rounded-2xl p-3 space-y-2.5 border border-white/80">
            {activeGraceOrder.items.map((item) => {
              const key = item.line_key || String(item.id);
              return (
                <div key={key} className="flex items-center justify-between text-xs gap-2">
                  <div>
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="text-slate-500 ml-1.5">₹{item.price * item.qty}</span>
                    {item.selected_modifiers?.length > 0 && (
                      <p className="text-[10px] text-[#007AFF] font-medium">
                        + {item.selected_modifiers.join(', ')}
                      </p>
                    )}
                    {item.note && (
                      <p className="text-[10px] italic text-rose-600">Note: {item.note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      disabled={isFinalizingBuffer}
                      onClick={() => handleUpdateGraceQty(key, -1)}
                      className="tactile w-7 h-7 rounded-full bg-slate-900/10 flex items-center justify-center disabled:opacity-40"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold w-4 text-center">{item.qty}</span>
                    <button
                      disabled={isFinalizingBuffer}
                      onClick={() => handleUpdateGraceQty(key, 1)}
                      className="tactile w-7 h-7 rounded-full bg-slate-900/10 flex items-center justify-center disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              disabled={isFinalizingBuffer}
              onClick={() => {
                triggerHaptic('success');
                onLockOrderNow(activeGraceOrder.id);
              }}
              className="tactile flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-full text-xs flex items-center justify-center gap-1.5 shadow"
            >
              <Send className="w-3.5 h-3.5" />
              Send Now
            </button>
            <button
              disabled={isFinalizingBuffer}
              onClick={async () => {
                triggerHaptic('medium');
                const ok = await onCancelGraceOrder(activeGraceOrder.id);
                showToast(ok ? 'Order cancelled' : 'Already locked to Kitchen');
              }}
              className="tactile bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-50 text-rose-700 font-semibold px-4 py-2.5 rounded-full text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LIVE ORDER STATUS & RUNNING BILL GLASS CARD */}
      {tableRunningOrders.length > 0 && (
        <div className="mx-3.5 mt-3 p-4 rounded-[28px] liquid-glass space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              {isParcelMode ? 'Your Parcel Status' : `Table #${selectedTable} Running Bill`}
            </span>
            <span className="text-sm font-bold text-slate-900">
              ₹{runningBillTotal.grandTotal}{' '}
              <span className="text-[10px] font-normal text-slate-500">incl. GST</span>
            </span>
          </div>

          <div className="space-y-2">
            {tableRunningOrders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white/65 border border-white/80 p-3 rounded-2xl flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {ord.id} - {ord.customer_name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {(ord.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ')}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                    ord.status === 'Grace_Period'
                      ? 'bg-amber-500/15 text-amber-800'
                      : ord.status === 'On_Hold'
                      ? 'bg-slate-200 text-slate-700'
                      : ord.status === 'New'
                      ? 'bg-[#007AFF]/15 text-[#0051A8]'
                      : ord.status === 'Preparing'
                      ? 'bg-[#007AFF] text-white shadow-sm'
                      : ord.status === 'Ready'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {ord.status === 'Grace_Period'
                    ? `Edit ${formatCountdown(Number(ord.grace_ends_at) - now)}`
                    : ord.status === 'On_Hold'
                    ? 'On Hold'
                    : ord.status === 'New'
                    ? 'Queued'
                    : ord.status === 'Preparing'
                    ? `Cooking ${formatTimer(now - Number(ord.accepted_at || now))}`
                    : ord.status === 'Ready'
                    ? isParcelMode
                      ? 'Ready at Counter'
                      : 'On the way'
                    : 'Served'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WAITING GAME */}
      {tableRunningOrders.some((o) => o.status === 'New' || o.status === 'Preparing') && (
        <TicTacToeGame />
      )}

      {/* FLOATING SEGMENTED CATEGORY PILLS */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3.5 py-3">
        {['All', 'Coffee', 'Food', 'Beverages', 'Desserts'].map((cat) => {
          const active = category === cat;
          return (
            <button
              key={cat}
              onClick={() => {
                triggerHaptic('light');
                setCategory(cat);
              }}
              className={`tactile px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
                active
                  ? 'bg-slate-900 text-white shadow-[0_6px_18px_rgba(15,23,42,0.22)]'
                  : 'liquid-pill text-slate-700 hover:bg-white/85'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* LIQUID GLASS MENU CARDS */}
      <div className="px-3.5 space-y-3">
        {menu
          .filter((m) => category === 'All' || m.category === category)
          .map((dish) => {
            const hasModifiers = Array.isArray(dish.modifiers) && dish.modifiers.length > 0;
            const inCartPlain = !hasModifiers ? cart.find((c) => c.id === dish.id) : null;

            return (
              <div
                key={dish.id}
                className={`liquid-glass rounded-[26px] p-4 flex items-center justify-between gap-3 transition ${
                  dish.in_stock ? '' : 'opacity-55 grayscale-[40%]'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-800">
                      {dish.dietary}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      ~{dish.prep_time}m
                    </span>
                    {hasModifiers && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#007AFF]">
                        <Sparkles className="w-2.5 h-2.5" /> Custom
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-[15px] tracking-tight text-slate-900 mt-1.5">
                    {dish.name}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                    {dish.description}
                  </p>
                  <p className="text-[15px] font-bold text-slate-900 mt-2">₹{dish.price}</p>
                </div>

                {!dish.in_stock ? (
                  <span className="px-3.5 py-2 rounded-full text-xs font-semibold bg-slate-900/10 text-slate-500 shrink-0">
                    Sold Out
                  </span>
                ) : !activeGraceOrder && inCartPlain ? (
                  <div className="liquid-pill flex items-center gap-1 rounded-full p-1 shrink-0">
                    <button
                      onClick={() =>
                        handleUpdateCartQty(inCartPlain.line_key || String(dish.id), -1)
                      }
                      className="tactile w-8 h-8 rounded-full bg-slate-900/8 text-slate-900 flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold w-6 text-center text-slate-900">
                      {inCartPlain.qty}
                    </span>
                    <button
                      onClick={() =>
                        handleUpdateCartQty(inCartPlain.line_key || String(dish.id), 1)
                      }
                      className="tactile w-8 h-8 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDishClick(dish)}
                    className={`tactile px-4 py-2.5 rounded-full text-xs font-semibold shrink-0 shadow-md ${
                      activeGraceOrder
                        ? 'bg-amber-500 text-white shadow-amber-500/25'
                        : 'bg-[#007AFF] hover:bg-[#0066D6] text-white shadow-[#007AFF]/30'
                    }`}
                  >
                    {activeGraceOrder
                      ? '+ Add Now'
                      : hasModifiers
                      ? '+ Customize'
                      : '+ Add'}
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {/* MODIFIER GLASS SHEET */}
      {customizingDish && (
        <ModifierModal
          dish={customizingDish}
          onClose={() => setCustomizingDish(null)}
          onConfirm={(customizedItem) => {
            commitAddItem(customizedItem);
            setCustomizingDish(null);
          }}
        />
      )}

      {/* FLOATING DARK GLASS CART DOCK */}
      {cart.length > 0 && !activeGraceOrder && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto liquid-glass-dark text-white px-4 py-3 rounded-full z-30 flex items-center justify-between gap-3">
          <div className="pl-2">
            <p className="text-[11px] text-slate-300 font-medium">
              {cart.reduce((s, i) => s + i.qty, 0)} items selected
            </p>
            <p className="font-bold text-base leading-tight">
              ₹{cart.reduce((s, i) => s + i.price * i.qty, 0)}{' '}
              <span className="text-[10px] font-normal text-slate-400">+ GST</span>
            </p>
          </div>
          <button
            onClick={() => {
              triggerHaptic('medium');
              setCheckoutError('');
              setShowCheckoutModal(true);
            }}
            className="tactile bg-[#007AFF] hover:bg-[#0066D6] text-white font-semibold px-5 py-3 rounded-full text-xs flex items-center gap-1.5 shadow-[0_8px_20px_rgba(0,122,255,0.4)]"
          >
            <ShoppingBag className="w-4 h-4" />
            {isParcelMode ? 'Order Parcel' : 'Review Order'}
          </button>
        </div>
      )}

      {/* CHECKOUT GLASS SHEET */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-md flex items-end sm:items-center justify-center p-3 z-50">
          <form
            onSubmit={handleConfirmPlaceOrder}
            className="liquid-glass rounded-[32px] max-w-sm w-full p-5 space-y-4"
          >
            <div className="w-10 h-1 rounded-full bg-slate-400/50 mx-auto sm:hidden" />

            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {isParcelMode
                  ? 'Confirm Parcel Order'
                  : `Confirm Table #${selectedTable} Order`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowCheckoutModal(false);
                }}
                className="tactile w-8 h-8 rounded-full bg-slate-900/10 text-slate-700 text-xs font-bold"
              >
                X
              </button>
            </div>

            {checkoutError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-xs font-semibold text-rose-800">
                {checkoutError}
              </div>
            )}

            <div className="bg-white/65 rounded-2xl p-3 max-h-32 overflow-y-auto space-y-1.5 border border-white/80">
              {cart.map((item) => {
                const key = item.line_key || String(item.id);
                return (
                  <div key={key} className="flex items-center justify-between text-xs gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">
                        {item.qty}x {item.name}
                      </span>
                      {item.selected_modifiers?.length > 0 && (
                        <p className="text-[10px] text-[#007AFF]">
                          + {item.selected_modifiers.join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="font-bold text-slate-900">₹{item.price * item.qty}</span>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Your Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  required
                  placeholder="e.g., Sharad"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white/75 border border-white/90 rounded-2xl text-sm focus:ring-2 focus:ring-[#007AFF] outline-none"
                />
              </div>
            </div>

            {!isParcelMode && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  2-Digit Table PIN <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  maxLength={2}
                  inputMode="numeric"
                  placeholder="Printed on your table card"
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white/75 border border-white/90 rounded-2xl text-sm font-mono font-bold tracking-widest focus:ring-2 focus:ring-[#007AFF] outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                WhatsApp Number <span className="normal-case font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  placeholder="For digital bill"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-white/75 border border-white/90 rounded-2xl text-sm focus:ring-2 focus:ring-[#007AFF] outline-none"
                />
              </div>
            </div>

            <button
              disabled={submitting}
              type="submit"
              className="tactile w-full bg-[#007AFF] hover:bg-[#0066D6] text-white font-semibold py-3.5 rounded-full text-sm flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(0,122,255,0.35)]"
            >
              <Clock className="w-4 h-4" />
              {submitting ? 'Placing Order...' : 'Place Order (60s Edit Timer)'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
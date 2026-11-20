import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import {
  Coffee,
  Utensils,
  QrCode,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Printer,
  RefreshCw,
  Smartphone,
  Lock,
  ChefHat,
  Bell,
  BellOff,
  Flame,
  Check,
  LogOut,
  CreditCard,
  ArrowRightLeft,
  Banknote,
  Receipt,
  BarChart3,
  TrendingUp,
  Wallet,
  Shield,
  History,
  Eye,
  EyeOff,
  Download,
  MessageCircle,
  Package,
  PauseCircle,
  PlayCircle,
  XCircle
} from 'lucide-react';
import { useMenu } from './hooks/useMenu';
import { useOrders } from './hooks/useOrders';
import { useErpData } from './hooks/useErpData';
import { useTableAlerts } from './hooks/useTableAlerts';
import ParcelOrderModal from './components/ParcelOrderModal';
import CustomerQrView from './components/CustomerQrView';
import {
  exportSalesGstrCsv,
  exportExpensesCsv,
  buildWhatsAppBillUrl
} from './utils/exportHelpers';
import { supabase } from './lib/supabase';

function formatTimer(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function playKitchenBell() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.25, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.46);
    });
  } catch {
    // Browser requires one click on page before playing audio
  }
}

/* ============================================================================
   STAFF DEPARTMENT PIN LOGIN GATE (SECURE RPC + PER-TAB sessionStorage)
============================================================================ */
function StaffLoginScreen({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setChecking(true);

    try {
      const { data, error: dbErr } = await supabase.rpc('verify_staff_pin', {
        p_pin: pin.trim()
      });

      if (dbErr) {
        setError(`Database Error: ${dbErr.message}`);
        return;
      }

      const staffRow = Array.isArray(data) ? data[0] : data;
      if (!staffRow) {
        setError('Invalid 4-digit Staff PIN.');
        return;
      }

      const sessionData = { ...staffRow, pin: pin.trim() };
      sessionStorage.setItem('cafe_staff_session', JSON.stringify(sessionData));
      onLogin(sessionData);
    } catch (err) {
      setError(`Connection Error: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <form
        onSubmit={handleLogin}
        className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center"
      >
        <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Cafe ERP Staff Login</h1>
          <p className="text-xs text-slate-500 mt-1">
            Enter your private 4-digit department PIN to continue.
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          required
          autoFocus
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full text-center text-2xl font-mono font-extrabold tracking-[0.5em] py-3 border-2 border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
        />

        <button
          disabled={checking}
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm shadow"
        >
          {checking ? 'Verifying PIN...' : 'Unlock Department'}
        </button>
      </form>
    </div>
  );
}

/* ============================================================================
   ADMIN: P&L ANALYTICS, EXPENSE TRACKER, STAFF PINS, AUDIT LOG & CSV EXPORTS
============================================================================ */
function AdminErpView({
  orders,
  expenses,
  logs,
  staffList,
  currentStaffId,
  onAddExpense,
  onDeleteExpense,
  onAddStaff,
  onDeleteStaff
}) {
  const [subTab, setSubTab] = useState('pnl');
  const [showPins, setShowPins] = useState(false);

  const [expForm, setExpForm] = useState({
    title: '',
    category: 'Inventory & Raw Materials',
    amount: '',
    vendor: '',
    paymentMode: 'UPI'
  });
  const [savingExp, setSavingExp] = useState(false);

  const [staffForm, setStaffForm] = useState({
    staffName: '',
    role: 'kitchen',
    pin: ''
  });
  const [savingStaff, setSavingStaff] = useState(false);

  const metrics = useMemo(() => {
    const paidOrders = orders.filter((o) => o.paid && o.status !== 'Cancelled');
    let grossRevenue = 0;
    let totalCogs = 0;
    const paymentSplit = { UPI: 0, Cash: 0, Card: 0 };
    const dishCounts = {};

    paidOrders.forEach((ord) => {
      const ordRev = (ord.items || []).reduce(
        (s, i) => s + Number(i.price || 0) * Number(i.qty || 0),
        0
      );
      const ordCogs = (ord.items || []).reduce(
        (s, i) => s + Number(i.recipe_cost || 0) * Number(i.qty || 0),
        0
      );
      grossRevenue += ordRev;
      totalCogs += ordCogs;

      const pm = ord.payment_method || 'UPI';
      paymentSplit[pm] = (paymentSplit[pm] || 0) + ordRev;

      (ord.items || []).forEach((i) => {
        dishCounts[i.name] = (dishCounts[i.name] || 0) + Number(i.qty || 0);
      });
    });

    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const grossProfit = grossRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;
    const netMarginPct = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 100) : 0;

    const timedOrders = orders.filter((o) => o.accepted_at && o.completed_at);
    const avgPrepMs =
      timedOrders.length > 0
        ? timedOrders.reduce(
            (s, o) => s + (Number(o.completed_at) - Number(o.accepted_at)),
            0
          ) / timedOrders.length
        : 0;

    const topDishes = Object.entries(dishCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      paidCount: paidOrders.length,
      grossRevenue,
      totalCogs,
      totalExpenses,
      grossProfit,
      netProfit,
      netMarginPct,
      paymentSplit,
      avgPrepMs,
      topDishes
    };
  }, [orders, expenses]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expForm.title || !expForm.amount) return;
    setSavingExp(true);
    try {
      await onAddExpense(expForm);
      setExpForm({
        title: '',
        category: 'Inventory & Raw Materials',
        amount: '',
        vendor: '',
        paymentMode: 'UPI'
      });
    } catch (err) {
      alert('Failed to log expense: ' + err.message);
    } finally {
      setSavingExp(false);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.staffName || staffForm.pin.trim().length !== 4) {
      alert('Please enter a name and an exact 4-digit PIN.');
      return;
    }
    setSavingStaff(true);
    try {
      await onAddStaff(staffForm);
      setStaffForm({ staffName: '', role: 'kitchen', pin: '' });
    } catch (err) {
      alert('Could not add staff (PIN must be unique): ' + err.message);
    } finally {
      setSavingStaff(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'pnl', label: 'P&L & Analytics', icon: BarChart3 },
            { id: 'expenses', label: `Expenses (${expenses.length})`, icon: Wallet },
            { id: 'staff', label: `Staff PINs (${staffList.length})`, icon: Shield },
            { id: 'logs', label: `Audit Log (${logs.length})`, icon: History }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setSubTab(item.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${subTab === item.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportSalesGstrCsv(orders)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Export GSTR-1 Sales CSV
          </button>
          <button
            onClick={() => exportExpensesCsv(expenses)}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Expenses CSV
          </button>
        </div>
      </div>

      {subTab === 'pnl' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500">Paid Revenue</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                ₹{metrics.grossRevenue.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500 mt-1">{metrics.paidCount} settled orders</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500">Recipe COGS</p>
              <p className="text-2xl font-extrabold text-amber-600 mt-1">
                ₹{metrics.totalCogs.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Gross Margin: ₹{metrics.grossProfit.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-500">Operating Expenses</p>
              <p className="text-2xl font-extrabold text-rose-600 mt-1">
                ₹{metrics.totalExpenses.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500 mt-1">{expenses.length} recorded bills</p>
            </div>

            <div
              className={`p-5 rounded-2xl border-2 shadow-sm ${
                metrics.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-rose-50 border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-slate-700">Net Profit</p>
                <TrendingUp
                  className={`w-4 h-4 ${
                    metrics.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                />
              </div>
              <p
                className={`text-2xl font-extrabold mt-1 ${
                  metrics.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                ₹{metrics.netProfit.toLocaleString('en-IN')}
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-1">
                Net Margin: {metrics.netMarginPct}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900">
                Revenue by Payment Mode & Kitchen Speed
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {['UPI', 'Cash', 'Card'].map((mode) => (
                  <div
                    key={mode}
                    className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-center"
                  >
                    <p className="text-xs font-bold text-slate-500">{mode}</p>
                    <p className="text-base font-extrabold text-slate-900 mt-1">
                      ₹{(metrics.paymentSplit[mode] || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-indigo-950">Average Kitchen Prep Time</p>
                  <p className="text-[11px] text-indigo-700">
                    Measured from Chef Accept to Ready for Pickup
                  </p>
                </div>
                <span className="font-mono font-extrabold text-lg text-indigo-700">
                  {metrics.avgPrepMs > 0 ? formatTimer(metrics.avgPrepMs) : '--:--'}
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Top Selling Menu Items</h3>
              {metrics.topDishes.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Settle orders in Cashier POS to see top-selling items.
                </p>
              ) : (
                <div className="space-y-2">
                  {metrics.topDishes.map(([name, qty], idx) => (
                    <div
                      key={name}
                      className="flex items-center justify-between bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-100 text-xs"
                    >
                      <span className="font-bold text-slate-800">
                        #{idx + 1} {name}
                      </span>
                      <span className="bg-indigo-100 text-indigo-700 font-extrabold px-2.5 py-0.5 rounded-full">
                        {qty} sold
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'expenses' && (
        <div className="space-y-5">
          <form
            onSubmit={handleAddExpense}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
          >
            <h3 className="font-bold text-sm text-slate-900">Log Operating Expense</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                required
                placeholder="Expense Title (e.g., Fresh Milk 20L)"
                value={expForm.title}
                onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <select
                value={expForm.category}
                onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option>Inventory & Raw Materials</option>
                <option>Staff Salary</option>
                <option>Rent & Utilities</option>
                <option>Maintenance</option>
                <option>Marketing & Misc</option>
              </select>
              <input
                required
                type="number"
                min="1"
                placeholder="Amount (₹)"
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <input
                placeholder="Vendor (Optional)"
                value={expForm.vendor}
                onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <select
                value={expForm.paymentMode}
                onChange={(e) => setExpForm({ ...expForm, paymentMode: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option>UPI</option>
                <option>Cash</option>
                <option>Bank Transfer</option>
              </select>
            </div>
            <button
              disabled={savingExp}
              type="submit"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {savingExp ? 'Saving...' : 'Record Expense'}
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-xs text-slate-400">
                      No expenses recorded yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-900">{exp.title}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{exp.category}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{exp.vendor || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                        {exp.payment_mode}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-rose-600">₹{exp.amount}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onDeleteExpense(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'staff' && (
        <div className="space-y-5">
          <form
            onSubmit={handleAddStaff}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
          >
            <h3 className="font-bold text-sm text-slate-900">Add Staff Member & Private PIN</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                required
                placeholder="Staff Name (e.g., Rahul Barista)"
                value={staffForm.staffName}
                onChange={(e) => setStaffForm({ ...staffForm, staffName: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <select
                value={staffForm.role}
                onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option value="kitchen">Kitchen (KDS Only)</option>
                <option value="cashier">Cashier (POS Only)</option>
                <option value="admin">Admin (Full Access)</option>
              </select>
              <input
                required
                maxLength={4}
                inputMode="numeric"
                placeholder="Unique 4-Digit PIN"
                value={staffForm.pin}
                onChange={(e) => setStaffForm({ ...staffForm, pin: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold tracking-widest"
              />
            </div>
            <button
              disabled={savingStaff}
              type="submit"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {savingStaff ? 'Creating...' : 'Add Staff PIN'}
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900">Active Department Accounts</h4>
              <button
                onClick={() => setShowPins((s) => !s)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPins ? 'Hide PINs' : 'Show PINs'}
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff Name</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">4-Digit PIN</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">{st.staff_name}</td>
                    <td className="px-4 py-3">
                      <span className="uppercase text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                        {st.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {showPins ? st.pin : '••••'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {st.id === currentStaffId ? (
                        <span className="text-[11px] font-bold text-emerald-600">Current</span>
                      ) : (
                        <button
                          onClick={() => onDeleteStaff(st.id, st.staff_name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="Delete Staff"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="font-bold text-sm text-slate-900">
            Live System Activity Audit Log (Latest 50 Events)
          </h3>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No activity logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] uppercase ${
                        log.actor === 'Kitchen'
                          ? 'bg-amber-100 text-amber-800'
                          : log.actor === 'Cashier'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.actor === 'Admin'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {log.actor}
                    </span>
                    <span className="text-slate-800 font-medium">{log.message}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(log.created_at).toLocaleTimeString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   CASHIER POS TERMINAL (DINE-IN FLOOR MAP + PARCEL COUNTER + VOID ORDER)
============================================================================ */
function CashierPosView({
  tables,
  menu,
  orders,
  alerts = [],
  onResolveAlert,
  onSettleTable,
  onSettleParcel,
  onCreateParcel,
  onVoidOrder,
  onMoveMergeTable
}) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [discountPct, setDiscountPct] = useState(0);
  const [gstPct, setGstPct] = useState(5);
  const [cashTendered, setCashTendered] = useState('');
  const [targetMoveTable, setTargetMoveTable] = useState('');
  const [settling, setSettling] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showParcelModal, setShowParcelModal] = useState(false);
  const [toast, setToast] = useState('');

  const [upiId, setUpiId] = useState(() => localStorage.getItem('cafe_upi_id') || 'cafe@upi');
  const [cafeName, setCafeName] = useState(
    () => localStorage.getItem('cafe_brand_name') || 'BREWCRAFT CAFE'
  );
  const [reviewLink, setReviewLink] = useState(
    () => localStorage.getItem('cafe_review_link') || ''
  );
  const [whatsappPhone, setWhatsappPhone] = useState('');

  const dineInTables = useMemo(
    () => tables.filter((t) => Number(t.table_number) > 0),
    [tables]
  );

  const activeParcelOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.order_type === 'Parcel' || Number(o.table_number) === 0) &&
          !o.paid &&
          o.status !== 'Cancelled'
      ),
    [orders]
  );

  const prevAlertIdsRef = useRef(new Set());
  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    let hasNew = false;
    currentIds.forEach((id) => {
      if (!prevAlertIdsRef.current.has(id)) hasNew = true;
    });
    if (hasNew && currentIds.size > 0) playKitchenBell();
    prevAlertIdsRef.current = currentIds;
  }, [alerts]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const unpaidByTable = useMemo(() => {
    const map = {};
    orders
      .filter(
        (o) =>
          !o.paid &&
          o.status !== 'Cancelled' &&
          o.order_type !== 'Parcel' &&
          Number(o.table_number) > 0
      )
      .forEach((o) => {
        const t = Number(o.table_number);
        if (!map[t]) map[t] = [];
        map[t].push(o);
      });
    return map;
  }, [orders]);

  useEffect(() => {
    if (selectedTable === null && dineInTables.length > 0) {
      const firstOccupied = dineInTables.find(
        (t) => (unpaidByTable[t.table_number] || []).length > 0
      );
      setSelectedTable(firstOccupied ? firstOccupied.table_number : dineInTables[0].table_number);
    }
  }, [dineInTables, unpaidByTable, selectedTable]);

  const activeOrders = useMemo(
    () => (selectedTable ? unpaidByTable[Number(selectedTable)] || [] : []),
    [unpaidByTable, selectedTable]
  );

  useEffect(() => {
    const foundPhone = activeOrders.find((o) => o.customer_phone)?.customer_phone || '';
    setWhatsappPhone(foundPhone);
  }, [selectedTable, activeOrders]);

  const hasGraceOrder = activeOrders.some((o) => o.status === 'Grace_Period');

  const consolidatedItems = useMemo(() => {
    const itemMap = {};
    activeOrders.forEach((ord) => {
      (ord.items || []).forEach((item) => {
        const modsText = (item.selected_modifiers || []).join(',');
        const key = `${item.id}-${item.name}-${item.price}-${modsText}`;
        if (!itemMap[key]) {
          itemMap[key] = { ...item, qty: Number(item.qty) };
        } else {
          itemMap[key].qty += Number(item.qty);
        }
      });
    });
    return Object.values(itemMap);
  }, [activeOrders]);

  const guestNames = useMemo(() => {
    const names = [...new Set(activeOrders.map((o) => o.customer_name).filter(Boolean))];
    return names.join(', ') || 'Walk-in Guest';
  }, [activeOrders]);

  const billing = useMemo(() => {
    const subtotal = consolidatedItems.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty),
      0
    );
    const discountAmt = Math.round((subtotal * Number(discountPct || 0)) / 100);
    const taxable = Math.max(0, subtotal - discountAmt);
    const gstAmt = Math.round((taxable * Number(gstPct || 0)) / 100);
    const grandTotal = taxable + gstAmt;
    return { subtotal, discountAmt, taxable, gstAmt, grandTotal };
  }, [consolidatedItems, discountPct, gstPct]);

  const cashChange = useMemo(() => {
    const received = Number(cashTendered || 0);
    return received > billing.grandTotal ? received - billing.grandTotal : 0;
  }, [cashTendered, billing.grandTotal]);

  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(
    cafeName.trim()
  )}&am=${billing.grandTotal}&cu=INR&tn=${encodeURIComponent(`Table ${selectedTable} Bill`)}`;

  const upiQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    upiUri
  )}`;

  const handleSettle = async () => {
    if (!selectedTable || activeOrders.length === 0) return;
    setSettling(true);
    try {
      await onSettleTable({
        tableNumber: selectedTable,
        paymentMethod,
        grandTotal: billing.grandTotal,
        discountAmt: billing.discountAmt
      });
      setDiscountPct(0);
      setCashTendered('');
      showToast(`Table #${selectedTable} settled (₹${billing.grandTotal} via ${paymentMethod}).`);
    } catch (err) {
      alert('Failed to settle bill: ' + err.message);
    } finally {
      setSettling(false);
    }
  };

  const handleMoveMerge = async () => {
    if (!selectedTable || !targetMoveTable) return;
    setMoving(true);
    try {
      await onMoveMergeTable(selectedTable, targetMoveTable);
      showToast(`Moved/Merged Table #${selectedTable} into Table #${targetMoveTable}.`);
      setSelectedTable(Number(targetMoveTable));
      setTargetMoveTable('');
    } catch (err) {
      alert('Move/Merge failed: ' + err.message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="p-3 rounded-xl bg-emerald-600 text-white text-xs font-bold text-center shadow print:hidden">
          {toast}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-3.5 space-y-2 print:hidden">
          <p className="text-xs font-extrabold uppercase text-amber-900 flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-600 animate-bounce" />
            Live Table Service Alerts ({alerts.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {alerts.map((al) => (
              <div
                key={al.id}
                className="bg-white border border-amber-300 rounded-xl px-3 py-2 flex items-center gap-3 text-xs shadow-sm"
              >
                <span className="font-extrabold text-slate-900">
                  Table #{al.table_number}:{' '}
                  <span className="text-amber-700">{al.alert_type}</span>
                </span>
                <button
                  onClick={() => onResolveAlert(al.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px]"
                >
                  Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-purple-950 text-white rounded-2xl p-4 shadow space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="bg-purple-600 p-2 rounded-xl">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">
                Parcel / Takeaway Counter ({activeParcelOrders.length} Active)
              </h3>
              <p className="text-[11px] text-purple-200">
                Walk-in takeaway orders & Counter QR orders settle independently from dine-in tables.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowParcelModal(true)}
            className="inline-flex items-center gap-1.5 bg-purple-500 hover:bg-purple-400 text-white font-bold px-4 py-2 rounded-xl text-xs shadow"
          >
            <Plus className="w-4 h-4" />
            New Parcel Order
          </button>
        </div>

        {activeParcelOrders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {activeParcelOrders.map((pcl) => {
              const pSub = (pcl.items || []).reduce(
                (s, i) => s + Number(i.price) * Number(i.qty),
                0
              );
              const pTotal = Math.round(pSub * 1.05);
              return (
                <div
                  key={pcl.id}
                  className="bg-white text-slate-900 rounded-xl p-3 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2 py-0.5 rounded">
                        {pcl.id} • {pcl.status}
                      </span>
                      <p className="font-bold text-xs mt-1">{pcl.customer_name}</p>
                      <p className="text-[11px] text-slate-500">
                        {(pcl.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <span className="font-extrabold text-sm text-purple-700">₹{pTotal}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    <button
                      onClick={async () => {
                        await onSettleParcel({
                          order: pcl,
                          paymentMethod: 'UPI',
                          grandTotal: pTotal
                        });
                        showToast(`Parcel ${pcl.id} marked Paid (₹${pTotal}).`);
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-[11px]"
                    >
                      Mark Paid (₹{pTotal})
                    </button>
                    <button
                      onClick={async () => {
                        const reason = window.prompt(
                          `Void Parcel ${pcl.id}? Enter reason:`,
                          'Customer cancelled takeaway'
                        );
                        if (reason !== null) {
                          await onVoidOrder(pcl, reason, 'Cashier');
                          showToast(`Parcel ${pcl.id} voided.`);
                        }
                      }}
                      className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
                    >
                      Void
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 print:hidden">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-base text-slate-900">Dine-In Table Floor Map</h2>
              <p className="text-xs text-slate-500">
                Select any occupied table to view its consolidated bill, move/merge, or settle.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-indigo-700">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span> Occupied
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Vacant
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {dineInTables.map((t) => {
              const tOrders = unpaidByTable[t.table_number] || [];
              const isOccupied = tOrders.length > 0;
              const isSelected = Number(selectedTable) === Number(t.table_number);
              const tSubtotal = tOrders.reduce(
                (sum, ord) =>
                  sum + (ord.items || []).reduce((s, i) => s + Number(i.price) * Number(i.qty), 0),
                0
              );

              return (
                <button
                  key={t.table_number}
                  onClick={() => {
                    setSelectedTable(t.table_number);
                    setDiscountPct(0);
                    setCashTendered('');
                  }}
                  className={`p-4 rounded-2xl border-2 text-left transition flex flex-col justify-between min-h-[115px] ${
                    isSelected
                      ? 'border-slate-900 ring-2 ring-indigo-500 bg-indigo-50/70'
                      : isOccupied
                      ? 'border-indigo-300 bg-white hover:border-indigo-500 shadow-sm'
                      : 'border-slate-200 bg-slate-50/70 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 rounded-lg ${
                        isOccupied ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      T#{t.table_number}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        isOccupied ? 'text-indigo-700' : 'text-slate-400'
                      }`}
                    >
                      {isOccupied ? `${tOrders.length} Ord` : 'Vacant'}
                    </span>
                  </div>

                  <div className="mt-3">
                    {isOccupied ? (
                      <>
                        <p className="text-base font-extrabold text-slate-900">
                          ₹{Math.round(tSubtotal * 1.05)}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {tOrders[0].customer_name}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-slate-400">Ready for guests</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Cafe Name (On Receipt & UPI)
              </label>
              <input
                value={cafeName}
                onChange={(e) => {
                  setCafeName(e.target.value);
                  localStorage.setItem('cafe_brand_name', e.target.value);
                }}
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Merchant UPI ID (For Dynamic QR)
              </label>
              <input
                value={upiId}
                onChange={(e) => {
                  setUpiId(e.target.value);
                  localStorage.setItem('cafe_upi_id', e.target.value);
                }}
                placeholder="e.g., mycafe@okicici"
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Google Maps Review Link (Appended to WhatsApp Bills)
              </label>
              <input
                value={reviewLink}
                onChange={(e) => {
                  setReviewLink(e.target.value);
                  localStorage.setItem('cafe_review_link', e.target.value);
                }}
                placeholder="https://g.page/r/your-cafe-review-link"
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  Table #{selectedTable} Bill
                </h3>
                <p className="text-xs text-slate-500">Guest: {guestNames}</p>
              </div>
              {activeOrders.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-xl text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print 80mm
                </button>
              )}
            </div>

            {activeOrders.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-500">Table #{selectedTable} is Vacant</p>
                <p className="text-xs text-slate-400">
                  No unpaid orders on this table right now.
                </p>
              </div>
            ) : (
              <>
                {hasGraceOrder && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-800">
                    Heads up: This table has an order currently in its 60-second customer edit
                    window.
                  </div>
                )}

                  <div className="space-y-1.5">
                    {activeOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-slate-800">{ord.id}</span>
                          <span className="ml-2 text-slate-500">({ord.status})</span>
                        </div>
                        <button
                          onClick={async () => {
                            const reason = window.prompt(
                              `Cancel ${ord.id} after 1-min window? Enter reason (logged to Audit Trail):`,
                              'Customer changed mind'
                            );
                            if (reason !== null) {
                              await onVoidOrder(ord, reason, 'Cashier');
                              showToast(`Voided ${ord.id} (${reason}).`);
                            }
                          }}
                          className="text-rose-600 hover:text-rose-800 font-bold underline"
                        >
                          Void Ticket
                        </button>
                      </div>
                    ))}
                  </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-slate-500 shrink-0" />
                  <select
                    value={targetMoveTable}
                    onChange={(e) => setTargetMoveTable(e.target.value)}
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="">Move / Merge into Table...</option>
                      {dineInTables
                      .filter((t) => Number(t.table_number) !== Number(selectedTable))
                      .map((t) => (
                        <option key={t.table_number} value={t.table_number}>
                          Table #{t.table_number}{' '}
                          {(unpaidByTable[t.table_number] || []).length > 0
                            ? '(Merge with Occupied)'
                            : '(Move to Vacant)'}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={!targetMoveTable || moving}
                    onClick={handleMoveMerge}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                  >
                    {moving ? '...' : 'Apply'}
                  </button>
                </div>

                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto border border-slate-100 rounded-xl px-3">
                  {consolidatedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2 flex items-center justify-between text-xs gap-2"
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {item.qty}× {item.name}
                        </span>
                        <span className="text-slate-400 ml-1.5">@ ₹{item.price}</span>
                        {item.selected_modifiers?.length > 0 && (
                          <p className="text-[11px] text-indigo-600">
                            + {item.selected_modifiers.join(', ')}
                          </p>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">
                        ₹{Number(item.price) * Number(item.qty)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Discount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      GST Rate (%)
                    </label>
                    <select
                      value={gstPct}
                      onChange={(e) => setGstPct(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold bg-white"
                    >
                      <option value={0}>0% (No Tax)</option>
                      <option value={5}>5% (CGST 2.5% + SGST 2.5%)</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-semibold">₹{billing.subtotal}</span>
                  </div>
                  {billing.discountAmt > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Discount ({discountPct}%)</span>
                      <span>- ₹{billing.discountAmt}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>GST ({gstPct}%)</span>
                    <span className="font-semibold">₹{billing.gstAmt}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-slate-900 border-t border-slate-200 pt-2 mt-1">
                    <span>Grand Total</span>
                    <span className="text-indigo-700">₹{billing.grandTotal}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'UPI', label: 'UPI QR', icon: QrCode },
                    { id: 'Cash', label: 'Cash', icon: Banknote },
                    { id: 'Card', label: 'Card', icon: CreditCard }
                  ].map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setPaymentMethod(mode.id)}
                        className={`py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1.5 transition ${
                          paymentMethod === mode.id
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                {paymentMethod === 'UPI' && (
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-3 flex items-center gap-4">
                    <img
                      src={upiQrSrc}
                      alt="Dynamic UPI QR"
                      className="w-24 h-24 rounded-xl border border-indigo-200 bg-white p-1 shrink-0"
                    />
                    <div className="text-xs space-y-1">
                      <p className="font-extrabold text-indigo-950">Scan to Pay ₹{billing.grandTotal}</p>
                      <p className="text-slate-600 font-mono text-[11px]">{upiId}</p>
                      <p className="text-[11px] text-slate-500">
                        Amount is pre-locked inside the QR for GPay, PhonePe & Paytm.
                      </p>
                    </div>
                  </div>
                )}

                {paymentMethod === 'Cash' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                        Cash Received (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder={String(billing.grandTotal)}
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-sm font-bold"
                      />
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-emerald-800">Change Return</p>
                      <p className="text-lg font-extrabold text-emerald-700">₹{cashChange}</p>
                    </div>
                  </div>
                )}

                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                    <input
                      type="tel"
                      placeholder="Guest 10-digit WhatsApp No."
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      className="flex-1 bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url = buildWhatsAppBillUrl({
                          phone: whatsappPhone,
                          cafeName,
                          tableNumber: selectedTable,
                          guestNames,
                          items: consolidatedItems,
                          billing,
                          discountPct,
                          gstPct,
                          paymentMethod,
                          reviewLink
                        });
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg text-xs shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp Bill
                    </button>
                  </div>

                <button
                  disabled={settling}
                  onClick={handleSettle}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold py-3.5 rounded-xl text-sm shadow flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {settling
                    ? 'Settling Bill...'
                    : `Mark Paid (₹${billing.grandTotal}) & Free Table #${selectedTable}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showParcelModal && (
        <ParcelOrderModal
          menu={menu}
          onClose={() => setShowParcelModal(false)}
          onCreateParcel={async ({ customerName, customerPhone, items }) => {
            await onCreateParcel({
              tableNumber: 0,
              qrToken: 'PARCEL-000',
              standeePin: '00',
              customerName,
              customerPhone,
              items,
              orderType: 'Parcel',
              immediateLock: true
            });
            showToast(`Parcel order for ${customerName} sent to Kitchen!`);
          }}
        />
      )}

      {activeOrders.length > 0 && (
        <div className="hidden print:block max-w-[300px] mx-auto font-mono text-black text-xs p-2">
          <div className="text-center border-b border-dashed border-black pb-2 mb-2">
            <h2 className="font-bold text-base uppercase">{cafeName}</h2>
            <p>Tax Invoice / Bill of Supply</p>
            <p className="mt-1">
              Table #{selectedTable} • {new Date().toLocaleString('en-IN')}
            </p>
            <p>Guest: {guestNames}</p>
          </div>

          <div className="border-b border-dashed border-black pb-2 mb-2 space-y-1">
            <div className="flex justify-between font-bold">
              <span>Item</span>
              <span>Amt</span>
            </div>
            {consolidatedItems.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span>
                  {item.qty}x {item.name}
                  {item.selected_modifiers?.length > 0
                    ? ` (${item.selected_modifiers.join(', ')})`
                    : ''}
                </span>
                <span>₹{Number(item.price) * Number(item.qty)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-b border-dashed border-black pb-2 mb-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{billing.subtotal}</span>
            </div>
            {billing.discountAmt > 0 && (
              <div className="flex justify-between">
                <span>Discount ({discountPct}%)</span>
                <span>-₹{billing.discountAmt}</span>
              </div>
            )}
            {gstPct > 0 && (
              <>
                <div className="flex justify-between">
                  <span>CGST ({gstPct / 2}%)</span>
                  <span>₹{(billing.gstAmt / 2).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST ({gstPct / 2}%)</span>
                  <span>₹{(billing.gstAmt / 2).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-sm pt-1">
              <span>GRAND TOTAL</span>
              <span>₹{billing.grandTotal}</span>
            </div>
          </div>

          <div className="text-center space-y-1">
            <p>Payment Mode: {paymentMethod}</p>
            <p className="font-bold mt-2">Thank you! Visit again.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   ADMIN: MENU & RECIPE COGS MANAGER
============================================================================ */
function MenuManager({ menu, onAdd, onToggleStock, onDelete }) {
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

/* ============================================================================
   ADMIN: TABLE QR STANDEE GENERATOR (INCLUDES COUNTER PARCEL QR)
============================================================================ */
function QrGenerator({ tables, onRefreshTables }) {
  const [adding, setAdding] = useState(false);

  const addNewTable = async () => {
    setAdding(true);
    try {
      const nextNum =
        tables.length > 0 ? Math.max(...tables.map((t) => Number(t.table_number))) + 1 : 1;
      const newToken = `T${nextNum}-${Math.floor(100 + Math.random() * 900)}`;
      const newPin = String(Math.floor(10 + Math.random() * 90));

      const { error } = await supabase.from('cafe_tables').insert([
        {
          table_number: nextNum,
          qr_token: newToken,
          standee_pin: newPin,
          status: 'Vacant'
        }
      ]);

      if (error) throw error;
      onRefreshTables();
    } catch (err) {
      alert('Could not add table: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteTable = async (tableNum) => {
    const { error } = await supabase
      .from('cafe_tables')
      .delete()
      .eq('table_number', tableNum);

    if (error) {
      alert('Cannot delete Table #' + tableNum + ' because it already has orders linked to it.');
      return;
    }
    onRefreshTables();
  };

  const regenerateTableToken = async (tableNum) => {
    const newToken =
      Number(tableNum) === 0
        ? `PARCEL-${Math.floor(100 + Math.random() * 900)}`
        : `T${tableNum}-${Math.floor(100 + Math.random() * 900)}`;
    const newPin = Number(tableNum) === 0 ? '00' : String(Math.floor(10 + Math.random() * 90));

    await supabase
      .from('cafe_tables')
      .update({ qr_token: newToken, standee_pin: newPin })
      .eq('table_number', tableNum);

    onRefreshTables();
  };

  const baseUrl = window.location.origin;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 print:hidden">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Table & Parcel Counter QR Standees
          </h2>
          <p className="text-xs text-slate-500">
            Place the purple Parcel QR on your billing counter so takeaway guests can browse & order.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={adding}
            onClick={addNewTable}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {adding ? 'Adding...' : 'Add Dine-In Table'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print All Standees
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tables.map((t) => {
          const isParcel = Number(t.table_number) === 0;
          const tableUrl = `${baseUrl}/?table=${t.table_number}&token=${t.qr_token}`;
          const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
            tableUrl
          )}`;

          return (
            <div
              key={t.table_number}
              className={`bg-white rounded-2xl border-2 p-5 text-center shadow-sm flex flex-col items-center relative ${isParcel ? 'border-purple-400' : 'border-slate-200'
                }`}
            >
              {!isParcel && (
                <button
                  onClick={() => deleteTable(t.table_number)}
                  className="print:hidden absolute top-3 right-3 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  title="Delete Table"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <span
                className={`text-white text-xs font-extrabold px-3 py-1 rounded-full ${isParcel ? 'bg-purple-600' : 'bg-indigo-600'
                  }`}
              >
                {isParcel ? 'PARCEL / TAKEAWAY' : `TABLE #${t.table_number}`}
              </span>
              <p className="text-xs text-slate-500 mt-1.5">
                {isParcel ? 'Counter Menu & Pack-To-Go' : 'Scan to Browse Menu & Order'}
              </p>

              <img
                src={qrSrc}
                alt={`Table ${t.table_number} QR`}
                className="w-40 h-40 my-4 rounded-xl border border-slate-200 p-2 bg-white"
              />

              <div className="bg-slate-100 rounded-xl px-3 py-1.5 w-full mb-3">
                <p className="text-[11px] uppercase font-bold text-slate-500">
                  {isParcel ? 'Order Mode' : 'Table Verify PIN'}
                </p>
                <p className="text-lg font-mono font-extrabold text-slate-900">
                  {isParcel ? 'NO PIN NEEDED' : t.standee_pin}
                </p>
              </div>

              <div className="flex items-center gap-3 print:hidden">
                <a
                  href={tableUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 underline"
                >
                  Open Link
                </a>
                <button
                  onClick={() => regenerateTableToken(t.table_number)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   KITCHEN DISPLAY SYSTEM (KDS) — PARCEL BADGES, HOLD/RESUME & VOID ORDER
============================================================================ */
function KitchenDisplayView({
  orders,
  menu,
  now,
  onStartPreparing,
  onMarkReady,
  onMarkServed,
  onToggleHold,
  onVoidOrder,
  onToggleStock
}) {
  const [stationFilter, setStationFilter] = useState('All');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showStockBar, setShowStockBar] = useState(false);

  const filterByStation = (orderList) => {
    if (stationFilter === 'All') return orderList;
    return orderList.filter((o) =>
      (o.items || []).some((item) => item.station === stationFilter)
    );
  };

  const newOrders = useMemo(
    () =>
      filterByStation(
        orders.filter((o) => o.status === 'New' || o.status === 'On_Hold')
      ).reverse(),
    [orders, stationFilter]
  );
  const preparingOrders = useMemo(
    () => filterByStation(orders.filter((o) => o.status === 'Preparing')).reverse(),
    [orders, stationFilter]
  );
  const readyOrders = useMemo(
    () => filterByStation(orders.filter((o) => o.status === 'Ready')).reverse(),
    [orders, stationFilter]
  );

  const prevNewIdsRef = useRef(new Set());
  useEffect(() => {
    const activeNew = newOrders.filter((o) => o.status === 'New');
    const currentIds = new Set(activeNew.map((o) => o.id));
    let hasBrandNew = false;
    currentIds.forEach((id) => {
      if (!prevNewIdsRef.current.has(id)) hasBrandNew = true;
    });
    if (hasBrandNew && soundEnabled && currentIds.size > 0) {
      playKitchenBell();
    }
    prevNewIdsRef.current = currentIds;
  }, [newOrders, soundEnabled]);

  const getSlaBadge = (elapsedMs) => {
    const mins = elapsedMs / 60000;
    if (mins >= 10) return 'bg-rose-600 text-white animate-pulse';
    if (mins >= 5) return 'bg-amber-500 text-white';
    return 'bg-emerald-600 text-white';
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base">Kitchen Display System (KDS)</h2>
            <p className="text-xs text-slate-400">
              Use Hold if a guest asks to delay prep, or Void if cancelled after 1 minute.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-800 p-1 rounded-xl">
            {['All', 'Barista', 'Hot Kitchen'].map((st) => (
              <button
                key={st}
                onClick={() => setStationFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  stationFilter === st
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowStockBar((s) => !s)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
              showStockBar
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            86 Stock Quick Toggle
          </button>

          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playKitchenBell();
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${
              soundEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {soundEnabled ? 'Bell On' : 'Muted'}
          </button>
        </div>
      </div>

      {showStockBar && (
        <div className="bg-white p-4 rounded-2xl border-2 border-rose-200 shadow-sm">
          <p className="text-xs font-bold text-slate-700 mb-3">
            Tap any dish to immediately mark it Sold Out (86) on all customer phones:
          </p>
          <div className="flex flex-wrap gap-2">
            {menu.map((item) => (
              <button
                key={item.id}
                onClick={() => onToggleStock(item.id, item.in_stock)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  item.in_stock
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-rose-50 hover:text-rose-700'
                    : 'bg-rose-600 border-rose-600 text-white line-through'
                }`}
              >
                {item.name} ({item.in_stock ? 'In Stock' : '86 Sold Out'})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              NEW / ON HOLD
            </h3>
            <span className="bg-blue-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {newOrders.length}
            </span>
          </div>

          {newOrders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">No new tickets waiting.</p>
          ) : (
            newOrders.map((ord) => {
              const waitMs = now - Number(ord.grace_ends_at || ord.created_at);
              const isParcel = ord.order_type === 'Parcel' || Number(ord.table_number) === 0;
              const isHeld = ord.status === 'On_Hold';

              return (
                <div
                  key={ord.id}
                  className={`rounded-2xl border-2 p-4 shadow-sm space-y-3 ${isHeld
                    ? 'bg-slate-50 border-slate-400'
                    : isParcel
                      ? 'bg-purple-50/40 border-purple-500'
                      : 'bg-white border-blue-400'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span
                        className={`text-white text-xs font-extrabold px-2.5 py-1 rounded-lg ${isParcel ? 'bg-purple-600' : 'bg-slate-900'
                          }`}
                      >
                        {isParcel ? 'PARCEL • PACK TO GO' : `TABLE #${ord.table_number}`}
                      </span>
                      <p className="font-bold text-sm text-slate-900 mt-1.5">
                        {ord.customer_name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">{ord.id}</p>
                    </div>
                    <span
                      className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg border ${isHeld
                        ? 'bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                    >
                      {isHeld ? 'PAUSED' : `Wait ${formatTimer(waitMs)}`}
                    </span>
                  </div>

                  <div className="border-t border-b border-slate-100 py-2.5 space-y-2">
                    {(ord.items || []).map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <span className="font-bold text-slate-800">
                            <span className="text-indigo-600 mr-1.5">{item.qty}×</span>
                            {item.name}
                          </span>
                          {item.selected_modifiers?.length > 0 && (
                            <p className="text-[11px] font-semibold text-indigo-700">
                              + {item.selected_modifiers.join(', ')}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-[11px] italic text-rose-600">Note: {item.note}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                          {item.station}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {!isHeld && (
                      <button
                        onClick={() => onStartPreparing(ord)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Flame className="w-4 h-4" />
                        Accept & Start Prep Timer
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onToggleHold(ord)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1"
                      >
                        {isHeld ? (
                          <>
                            <PlayCircle className="w-3.5 h-3.5 text-emerald-700" /> Resume
                          </>
                        ) : (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" /> Hold Prep
                          </>
                        )}
                      </button>
                      <button
                        onClick={async () => {
                          const reason = window.prompt(
                            `Void ${ord.id}? Enter reason:`,
                            'Customer requested cancellation'
                          );
                          if (reason !== null) {
                            await onVoidOrder(ord, reason, 'Kitchen');
                          }
                        }}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Void
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              PREPARING (LIVE SLA)
            </h3>
            <span className="bg-amber-500 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {preparingOrders.length}
            </span>
          </div>

          {preparingOrders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">No orders cooking right now.</p>
          ) : (
            preparingOrders.map((ord) => {
              const elapsedMs = now - Number(ord.accepted_at || ord.created_at);
              const isParcel = ord.order_type === 'Parcel' || Number(ord.table_number) === 0;
              return (
                <div
                  key={ord.id}
                  className={`rounded-2xl border-2 p-4 shadow-sm space-y-3 ${isParcel
                    ? 'bg-purple-50/40 border-purple-500'
                    : 'bg-white border-amber-400'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span
                        className={`text-white text-xs font-extrabold px-2.5 py-1 rounded-lg ${isParcel ? 'bg-purple-600' : 'bg-slate-900'
                          }`}
                      >
                        {isParcel ? 'PARCEL • PACK TO GO' : `TABLE #${ord.table_number}`}
                      </span>
                      <p className="font-bold text-sm text-slate-900 mt-1.5">
                        {ord.customer_name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">{ord.id}</p>
                    </div>
                    <span
                      className={`font-mono font-extrabold text-xs px-2.5 py-1 rounded-lg ${getSlaBadge(
                        elapsedMs
                      )}`}
                    >
                      ⏱ {formatTimer(elapsedMs)}
                    </span>
                  </div>

                  <div className="border-t border-b border-slate-100 py-2.5 space-y-2">
                    {(ord.items || []).map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <span className="font-bold text-slate-800">
                            <span className="text-amber-600 mr-1.5">{item.qty}×</span>
                            {item.name}
                          </span>
                          {item.selected_modifiers?.length > 0 && (
                            <p className="text-[11px] font-semibold text-indigo-700">
                              + {item.selected_modifiers.join(', ')}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-[11px] italic text-rose-600">Note: {item.note}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                          {item.station}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => onMarkReady(ord)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isParcel ? 'Mark Parcel Packed & Ready' : 'Mark Ready for Pickup'}
                    </button>
                    <button
                      onClick={async () => {
                        const reason = window.prompt(
                          `Void cooking order ${ord.id}? Enter reason:`,
                          'Cancelled mid-prep'
                        );
                        if (reason !== null) {
                          await onVoidOrder(ord, reason, 'Kitchen');
                        }
                      }}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-1.5 rounded-xl text-[11px]"
                    >
                      Void / Cancel Order
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              READY FOR PICKUP
            </h3>
            <span className="bg-emerald-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {readyOrders.length}
            </span>
          </div>

          {readyOrders.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">Pickup counter is clear.</p>
          ) : (
            readyOrders.map((ord) => {
              const prepMs =
                ord.completed_at && ord.accepted_at
                  ? Number(ord.completed_at) - Number(ord.accepted_at)
                  : 0;
              const isParcel = ord.order_type === 'Parcel' || Number(ord.table_number) === 0;

              return (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl border-2 border-emerald-400 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span
                        className={`text-white text-xs font-extrabold px-2.5 py-1 rounded-lg ${isParcel ? 'bg-purple-600' : 'bg-emerald-600'
                          }`}
                      >
                        {isParcel
                          ? 'PARCEL READY AT COUNTER'
                          : `DELIVER TO TABLE #${ord.table_number}`}
                      </span>
                      <p className="font-bold text-sm text-slate-900 mt-1.5">
                        Guest: {ord.customer_name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">{ord.id}</p>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold text-xs px-2 py-1 rounded-lg">
                      Cooked {formatTimer(prepMs)}
                    </span>
                  </div>

                  <div className="border-t border-b border-slate-100 py-2 space-y-1">
                    {(ord.items || []).map((item, idx) => (
                      <div key={idx}>
                        <p className="text-sm font-bold text-slate-800">
                          {item.qty}× {item.name}
                        </p>
                        {item.selected_modifiers?.length > 0 && (
                          <p className="text-[11px] text-indigo-700">
                            + {item.selected_modifiers.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => onMarkServed(ord)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {isParcel ? 'Confirm Handed to Customer' : 'Confirm Served to Table'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   MAIN APP SHELL WITH PER-TAB ROLE-BASED ROUTING
============================================================================ */
export default function App() {
  const [tables, setTables] = useState([]);
  const [lockedTableNumber, setLockedTableNumber] = useState(() => {
    const param = new URLSearchParams(window.location.search).get('table');
    return param !== null ? Number(param) : null;
  });
  const [lockedQrToken, setLockedQrToken] = useState(() => {
    return new URLSearchParams(window.location.search).get('token') || null;
  });
  const [staffSession, setStaffSession] = useState(() => {
    const saved = sessionStorage.getItem('cafe_staff_session');
    return saved ? JSON.parse(saved) : null;
  });

  const [tab, setTab] = useState(() => {
    if (new URLSearchParams(window.location.search).get('table') !== null) {
      return 'customer';
    }
    const saved = sessionStorage.getItem('cafe_staff_session');
    if (saved) {
      const role = JSON.parse(saved).role;
      if (role === 'kitchen') return 'kds';
      if (role === 'cashier') return 'pos';
    }
    return 'erp';
  });

  const { menu, loading, addDish, toggleStock, deleteDish } = useMenu();
  const {
    orders,
    now,
    placeGraceOrder,
    updateGraceOrderItems,
    cancelGraceOrder,
    lockOrderNow,
    staffCancelOrder,
    toggleHoldOrder,
    startPreparing,
    markOrderReady,
    markOrderServed,
    settleTableBill,
    settleParcelOrder,
    moveOrMergeTable
  } = useOrders();
  const {
    expenses,
    logs,
    staffList,
    addExpense,
    deleteExpense,
    addStaff,
    deleteStaff
  } = useErpData(staffSession?.role === 'admin' ? staffSession.pin : null);
  const { alerts, sendTableAlert, resolveTableAlert } = useTableAlerts();

  const fetchTables = useCallback(async () => {
    const { data } = await supabase
      .from('cafe_tables')
      .select('*')
      .order('table_number', { ascending: true });
    if (data) setTables(data);
  }, []);

  useEffect(() => {
    fetchTables();

    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    const tokenParam = params.get('token');
    if (tableParam !== null) {
      setLockedTableNumber(Number(tableParam));
      setLockedQrToken(tokenParam || '');
      setTab('customer');
    }

    const tableChannel = supabase
      .channel('realtime-tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cafe_tables' },
        () => fetchTables()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tableChannel);
    };
  }, [fetchTables]);

  const handleStaffLogin = (staff) => {
    setStaffSession(staff);
    if (staff.role === 'kitchen') setTab('kds');
    else if (staff.role === 'cashier') setTab('pos');
    else setTab('erp');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('cafe_staff_session');
    setStaffSession(null);
  };

  const canSee = (targetTab) => {
    if (!staffSession) return false;
    if (staffSession.role === 'admin') return true;
    if (staffSession.role === 'kitchen') return targetTab === 'kds';
    if (staffSession.role === 'cashier') return targetTab === 'pos';
    return false;
  };

  if (lockedTableNumber === null && !staffSession) {
    return <StaffLoginScreen onLogin={handleStaffLogin} />;
  }

  const kdsNewCount = orders.filter((o) => o.status === 'New').length;
  const occupiedCount = new Set(
    orders
      .filter(
        (o) =>
          !o.paid &&
          o.status !== 'Cancelled' &&
          o.order_type !== 'Parcel' &&
          Number(o.table_number) > 0
      )
      .map((o) => Number(o.table_number))
  ).size;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {lockedTableNumber === null && staffSession && (
        <header className="bg-slate-900 text-white sticky top-0 z-30 shadow print:hidden">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-2 rounded-xl">
                <Coffee className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-sm sm:text-base">
                  Cafe ERP —{' '}
                  <span className="uppercase text-indigo-400">{staffSession.role}</span>
                </h1>
                <p className="text-xs text-slate-400">Logged in as {staffSession.staff_name}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canSee('erp') && (
                <button
                  onClick={() => setTab('erp')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    tab === 'erp'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  ERP & P&L
                </button>
              )}

              {canSee('pos') && (
                <button
                  onClick={() => setTab('pos')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    tab === 'pos'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Cashier POS
                  {(occupiedCount > 0 || alerts.length > 0) && (
                    <span
                      className={`${
                        alerts.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                      } text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full`}
                    >
                      {alerts.length > 0 ? `${alerts.length}!` : occupiedCount}
                    </span>
                  )}
                </button>
              )}

              {canSee('kds') && (
                <button
                  onClick={() => setTab('kds')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    tab === 'kds'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <ChefHat className="w-4 h-4" />
                  Kitchen (KDS)
                  {kdsNewCount > 0 && (
                    <span className="bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {kdsNewCount}
                    </span>
                  )}
                </button>
              )}

              {canSee('menu') && (
                <button
                  onClick={() => setTab('menu')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    tab === 'menu'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                  Menu & COGS
                </button>
              )}

              {canSee('qr') && (
                <button
                  onClick={() => setTab('qr')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    tab === 'qr'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Table & Parcel QRs
                </button>
              )}

              {canSee('customer') && (
                <button
                  onClick={() => setTab('customer')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                    tab === 'customer'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  Customer
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                title="Switch Department / Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {lockedTableNumber !== null ? (
          <CustomerQrView
            menu={menu}
            tables={tables}
            orders={orders}
            now={now}
            lockedTableNumber={lockedTableNumber}
            lockedQrToken={lockedQrToken}
            alerts={alerts}
            onSendAlert={sendTableAlert}
            onPlaceGraceOrder={placeGraceOrder}
            onUpdateGraceItems={updateGraceOrderItems}
            onCancelGraceOrder={cancelGraceOrder}
            onLockOrderNow={lockOrderNow}
          />
        ) : loading ? (
          <p className="text-sm text-slate-500 text-center py-12">Connecting to Supabase...</p>
        ) : tab === 'erp' && canSee('erp') ? (
          <AdminErpView
            orders={orders}
            expenses={expenses}
            logs={logs}
            staffList={staffList}
            currentStaffId={staffSession?.id}
            onAddExpense={addExpense}
            onDeleteExpense={deleteExpense}
            onAddStaff={addStaff}
            onDeleteStaff={deleteStaff}
          />
        ) : tab === 'pos' && canSee('pos') ? (
          <CashierPosView
            tables={tables}
                  menu={menu}
            orders={orders}
            alerts={alerts}
            onResolveAlert={resolveTableAlert}
            onSettleTable={settleTableBill}
                  onSettleParcel={settleParcelOrder}
                  onCreateParcel={placeGraceOrder}
                  onVoidOrder={staffCancelOrder}
            onMoveMergeTable={moveOrMergeTable}
          />
        ) : tab === 'kds' && canSee('kds') ? (
          <KitchenDisplayView
            orders={orders}
            menu={menu}
            now={now}
            onStartPreparing={startPreparing}
            onMarkReady={markOrderReady}
            onMarkServed={markOrderServed}
                    onToggleHold={toggleHoldOrder}
                    onVoidOrder={staffCancelOrder}
            onToggleStock={toggleStock}
          />
        ) : tab === 'menu' && canSee('menu') ? (
          <MenuManager
            menu={menu}
            onAdd={addDish}
            onToggleStock={toggleStock}
            onDelete={deleteDish}
          />
        ) : tab === 'qr' && canSee('qr') ? (
          <QrGenerator tables={tables} onRefreshTables={fetchTables} />
        ) : (
          <CustomerQrView
            menu={menu}
            tables={tables}
            orders={orders}
            now={now}
            lockedTableNumber={lockedTableNumber}
            lockedQrToken={lockedQrToken}
                          alerts={alerts}
            onSendAlert={sendTableAlert}
            onPlaceGraceOrder={placeGraceOrder}
            onUpdateGraceItems={updateGraceOrderItems}
            onCancelGraceOrder={cancelGraceOrder}
            onLockOrderNow={lockOrderNow}
          />
        )}
      </main>
    </div>
  );
}
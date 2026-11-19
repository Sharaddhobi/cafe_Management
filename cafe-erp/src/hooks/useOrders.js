import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('realtime-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') fetchOrders();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // 1-second heartbeat for live countdowns, KDS SLA timers, and auto-locking grace orders
  useEffect(() => {
    const timer = setInterval(async () => {
      const current = Date.now();
      setNow(current);

      const hasExpired = orders.some(
        (o) => o.status === 'Grace_Period' && Number(o.grace_ends_at) <= current
      );

      if (hasExpired) {
        await supabase.rpc('lock_expired_grace_orders');
        await fetchOrders();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [orders, fetchOrders]);

const placeGraceOrder = async ({
    tableNumber,
    qrToken,
    standeePin,
    customerName,
    customerPhone,
    items
  }) => {
    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

const minimalItems = items.map((i) => ({
      id: i.id,
      line_key: i.line_key || String(i.id),
      qty: i.qty,
      selected_modifiers: i.selected_modifiers || [],
      note: i.note || ''
    }));
    
    const { data, error } = await supabase.rpc('create_grace_order', {
      p_order_id: orderId,
      p_table_number: Number(tableNumber),
      p_qr_token: qrToken,
      p_standee_pin: standeePin,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone?.trim() || '',
      p_items: minimalItems
    });
    if (error) throw error;
    await fetchOrders();
    return data;
  };

  const updateGraceOrderItems = async (orderId, updatedItems) => {
    const minimalItems = updatedItems.map((i) => ({ id: i.id, qty: i.qty }));
    const { data, error } = await supabase.rpc('update_grace_order_items', {
      p_order_id: orderId,
      p_items: minimalItems
    });
    if (error) throw error;
    await fetchOrders();
    return Boolean(data);
  };

  const cancelGraceOrder = async (orderId) => {
    const { data, error } = await supabase.rpc('cancel_grace_order', {
      p_order_id: orderId
    });
    if (error) throw error;
    await fetchOrders();
    return Boolean(data);
  };

  const lockOrderNow = async (orderId) => {
    const { data, error } = await supabase.rpc('lock_order_now', {
      p_order_id: orderId
    });
    if (error) throw error;
    await fetchOrders();
    return Boolean(data);
  };

  // --- MILESTONE 3: KDS & WAITER TRANSITIONS ---
  const startPreparing = async (order) => {
    const ts = Date.now();
    const { error } = await supabase
      .from('orders')
      .update({ status: 'Preparing', accepted_at: ts })
      .eq('id', order.id);

    if (error) throw error;

    await supabase.from('activity_logs').insert([
      {
        actor: 'Kitchen',
        message: `Chef started preparing ${order.id} (Table #${order.table_number} - ${order.customer_name}).`
      }
    ]);
    await fetchOrders();
  };

  const markOrderReady = async (order) => {
    const ts = Date.now();
    const prepSecs = order.accepted_at ? Math.round((ts - Number(order.accepted_at)) / 1000) : 0;

    const { error } = await supabase
      .from('orders')
      .update({ status: 'Ready', completed_at: ts })
      .eq('id', order.id);

    if (error) throw error;

    await supabase.from('activity_logs').insert([
      {
        actor: 'Kitchen',
        message: `${order.id} (Table #${order.table_number}) marked READY in ${prepSecs}s.`
      }
    ]);
    await fetchOrders();
  };

  const markOrderServed = async (order) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'Served' })
      .eq('id', order.id);

    if (error) throw error;

    await supabase.from('activity_logs').insert([
      {
        actor: 'Waiter',
        message: `Delivered ${order.id} to Table #${order.table_number} (${order.customer_name}).`
      }
    ]);
    await fetchOrders();
  };

  // --- MILESTONE 4: CASHIER POS SETTLEMENT & MOVE/MERGE ---
  const settleTableBill = async ({ tableNumber, paymentMethod, grandTotal, discountAmt = 0 }) => {
    const { error: orderErr } = await supabase
      .from('orders')
      .update({
        paid: true,
        payment_method: paymentMethod
      })
      .eq('table_number', Number(tableNumber))
      .eq('paid', false)
      .neq('status', 'Cancelled');

    if (orderErr) throw orderErr;

    const { error: tableErr } = await supabase
      .from('cafe_tables')
      .update({ status: 'Vacant' })
      .eq('table_number', Number(tableNumber));

    if (tableErr) throw tableErr;

    await supabase.from('activity_logs').insert([
      {
        actor: 'Cashier',
        message: `Settled Table #${tableNumber} bill (₹${grandTotal}${
          discountAmt > 0 ? `, Discount ₹${discountAmt}` : ''
        }) via ${paymentMethod}. Table freed.`
      }
    ]);

    await fetchOrders();
  };

  const moveOrMergeTable = async (fromTable, toTable) => {
    const source = Number(fromTable);
    const target = Number(toTable);
    if (source === target) return;

    const { error: moveErr } = await supabase
      .from('orders')
      .update({ table_number: target })
      .eq('table_number', source)
      .eq('paid', false)
      .neq('status', 'Cancelled');

    if (moveErr) throw moveErr;

    await supabase.from('cafe_tables').update({ status: 'Vacant' }).eq('table_number', source);
    await supabase.from('cafe_tables').update({ status: 'Occupied' }).eq('table_number', target);

    await supabase.from('activity_logs').insert([
      {
        actor: 'Cashier',
        message: `Moved/Merged active orders from Table #${source} to Table #${target}.`
      }
    ]);

    await fetchOrders();
  };

  return {
    orders,
    now,
    placeGraceOrder,
    updateGraceOrderItems,
    cancelGraceOrder,
    lockOrderNow,
    startPreparing,
    markOrderReady,
    markOrderServed,
    settleTableBill,
    moveOrMergeTable
  };
}
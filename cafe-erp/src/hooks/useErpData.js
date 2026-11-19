import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useErpData(adminPin) {
  const [expenses, setExpenses] = useState([]);
  const [logs, setLogs] = useState([]);
  const [staffList, setStaffList] = useState([]);

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setExpenses(data);
  }, []);

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setLogs(data);
  }, []);

  const fetchStaff = useCallback(async () => {
    if (!adminPin) {
      setStaffList([]);
      return;
    }
    const { data, error } = await supabase.rpc('admin_list_staff', {
      p_admin_pin: adminPin
    });
    if (!error && data) setStaffList(data);
  }, [adminPin]);

  useEffect(() => {
    fetchExpenses();
    fetchLogs();
    fetchStaff();

    const channel = supabase
      .channel('realtime-erp')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => fetchExpenses()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs' },
        () => fetchLogs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchExpenses, fetchLogs, fetchStaff]);

  const addExpense = async ({ title, category, amount, vendor, paymentMode }) => {
    const id = `EXP-${Math.floor(100000 + Math.random() * 900000)}`;
    const { error } = await supabase.from('expenses').insert([
      {
        id,
        title: title.trim(),
        category,
        amount: Number(amount),
        vendor: vendor?.trim() || '',
        payment_mode: paymentMode
      }
    ]);
    if (error) throw error;

    await supabase.from('activity_logs').insert([
      {
        actor: 'Admin',
        message: `Logged expense: ${title.trim()} (₹${Number(amount)} via ${paymentMode}).`
      }
    ]);

    await fetchExpenses();
    await fetchLogs();
  };

  const deleteExpense = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    await fetchExpenses();
  };

  const addStaff = async ({ staffName, role, pin }) => {
    const { error } = await supabase.rpc('admin_add_staff', {
      p_admin_pin: adminPin,
      p_staff_name: staffName.trim(),
      p_role: role,
      p_new_pin: pin.trim()
    });
    if (error) throw error;
    await fetchStaff();
    await fetchLogs();
  };

  const deleteStaff = async (id, staffName) => {
    const { error } = await supabase.rpc('admin_delete_staff', {
      p_admin_pin: adminPin,
      p_target_id: id,
      p_staff_name: staffName
    });
    if (error) throw error;
    await fetchStaff();
    await fetchLogs();
  };

  return {
    expenses,
    logs,
    staffList,
    addExpense,
    deleteExpense,
    addStaff,
    deleteStaff
  };
}
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useTableAlerts() {
  const [alerts, setAlerts] = useState([]);

  const fetchAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('table_alerts')
      .select('*')
      .eq('status', 'Open')
      .order('created_at', { ascending: false });

    if (!error && data) setAlerts(data);
  }, []);

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('realtime-table-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_alerts' },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts]);

  const sendTableAlert = async (tableNumber, alertType) => {
    const { error } = await supabase.from('table_alerts').insert([
      {
        table_number: Number(tableNumber),
        alert_type: alertType,
        status: 'Open'
      }
    ]);
    if (error) throw error;
    await fetchAlerts();
  };

  const resolveTableAlert = async (alertId) => {
    const { error } = await supabase
      .from('table_alerts')
      .update({ status: 'Resolved' })
      .eq('id', alertId);
    if (error) throw error;
    await fetchAlerts();
  };

  return { alerts, sendTableAlert, resolveTableAlert };
}
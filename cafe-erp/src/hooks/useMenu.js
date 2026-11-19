import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useMenu() {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMenu = useCallback(async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data) {
      setMenu(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMenu();

    const channel = supabase
      .channel('realtime-menu')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        () => fetchMenu()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMenu]);

  const addDish = async (dish) => {
    const { error } = await supabase.from('menu_items').insert([
      {
        name: dish.name.trim(),
        category: dish.category,
        price: Number(dish.price),
        recipe_cost: Number(dish.recipeCost),
        station: dish.station,
        dietary: dish.dietary,
        prep_time: Number(dish.prepTime || 5),
        description: dish.description.trim(),
        in_stock: true
      }
    ]);
    if (error) throw error;
  };

  const toggleStock = async (id, currentStock) => {
    const { error } = await supabase
      .from('menu_items')
      .update({ in_stock: !currentStock })
      .eq('id', id);
    if (error) throw error;
  };

  const deleteDish = async (id) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) throw error;
  };

  return { menu, loading, addDish, toggleStock, deleteDish };
}
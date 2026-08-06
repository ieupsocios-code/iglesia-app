import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [session, setSession]   = useState(null);
  const [perfil, setPerfil]     = useState(null);
  const [loadingAuth, setLoading] = useState(true);

  // Cargar perfil del usuario
  const cargarPerfil = async (userId) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*, templos(nombre)')
      .eq('id', userId)
      .single();
    if (!error && data) setPerfil(data);
  };

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) cargarPerfil(session.user.id);
      setLoading(false);
    });

    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) cargarPerfil(session.user.id);
      else { setPerfil(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPerfil(null);
  };

 const puede = {
  verTodo:             perfil?.rol === 'admin' || perfil?.rol === 'consulta',
  gestionarMiembros:   perfil?.rol === 'admin',
  gestionarCobradores: perfil?.rol === 'admin',
  registrarCobranza:   perfil?.rol === 'admin' || perfil?.rol === 'cobrador',
  eliminarCobranza:    perfil?.rol === 'admin',
  configurar:          perfil?.rol === 'admin',
  gestionarUsuarios:   perfil?.rol === 'admin',
};

  return { session, perfil, loadingAuth, signIn, signOut, puede };
}

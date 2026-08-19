import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { Plus, Trash2, Calendar, Save, Edit2, X, Target, RefreshCw, CheckCircle, Moon, Sun, Clock, Menu, Home, FileText, Download, ChevronLeft, Utensils, Info, LogOut, Eraser } from 'lucide-react';

// ─── CLT §58 §1º: tolerância de 5 minutos por marcação (máx 10min/dia) ────────
// Se a diferença entre o horário marcado e o horário padrão for ≤ 5min, ela é
// desprezada — nem descontada, nem acrescentada.
// Aqui aplicamos isso ao cálculo de horas trabalhadas:
// - Entrada adiantada em até 5min → considera a hora exata contratada (não conta extra)
// - Saída antecipada em até 5min → considera a hora exata contratada (não desconta)
// - Saída atrasada em até 5min → considera a hora exata contratada (não conta extra)
const applyTolerance = (timeStr, referenceMinutes, toleranceMinutes = 5) => {
  if (!timeStr || referenceMinutes == null) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const actual = h * 60 + m;
  const diff = actual - referenceMinutes;
  if (Math.abs(diff) <= toleranceMinutes) return referenceMinutes; // dentro da tolerância
  return actual; // fora da tolerância → usa o horário real
};

const TimesheetControl = () => {
  const [entries, setEntries] = useState([]);
  const [currentEntry, setCurrentEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    entry: '',
    lunchOut: '',
    lunchIn: '',
    exit: '',
    isHalfDay: false,
    isAbsence: false
  });
  const [suggestedExit, setSuggestedExit] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [hoursGoal, setHoursGoal] = useState({ total: 0, deadline: '', hoursPaid: 0 });
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const isInitialLoad = useRef(true);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [cloudDataLoaded, setCloudDataLoaded] = useState(false);
  const [localBackup, setLocalBackup] = useState(null);

  // Detecta registros salvos localmente (versão anterior à sincronização com o Supabase)
  useEffect(() => {
    if (localStorage.getItem('supabase_migration_done')) return;
    try {
      const savedEntries = localStorage.getItem('timesheet_entries');
      const parsedEntries = savedEntries ? JSON.parse(savedEntries) : [];
      if (Array.isArray(parsedEntries) && parsedEntries.length > 0) {
        const savedGoal = localStorage.getItem('hours_goal');
        setLocalBackup({
          entries: parsedEntries,
          hoursGoal: savedGoal ? JSON.parse(savedGoal) : null,
        });
      } else {
        localStorage.setItem('supabase_migration_done', '1');
      }
    } catch (e) {
      console.error('Erro ao ler registros locais', e);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    isInitialLoad.current = true;
    setCloudDataLoaded(false);
    const loadData = async () => {
      const { data, error } = await supabase
        .from('timesheet_data')
        .select('entries, hours_goal, dark_mode')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) console.error('Erro ao carregar dados', error);
      if (data) {
        if (data.entries) setEntries(data.entries);
        if (data.hours_goal) setHoursGoal(data.hours_goal);
        if (data.dark_mode !== null) setDarkMode(data.dark_mode);
      }
      isInitialLoad.current = false;
      setCloudDataLoaded(true);
    };
    loadData();
  }, [session]);

  useEffect(() => {
    if (isInitialLoad.current || !session) return;
    const saveData = async () => {
      const { error } = await supabase.from('timesheet_data').upsert({
        user_id: session.user.id,
        entries,
        hours_goal: hoursGoal,
        dark_mode: darkMode,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('Erro ao salvar dados', error);
    };
    saveData();
  }, [entries, hoursGoal, darkMode, session]);

  const formatHoursMinutes = (h) => {
    if (h === 0) return '0h00m';
    const abs = Math.abs(h);
    const hours = Math.floor(abs);
    const mins = Math.round((abs - hours) * 60);
    return `${h < 0 ? '-' : ''}${hours}h${mins.toString().padStart(2, '0')}m`;
  };

  const getDayOfWeek = (d) => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days[new Date(d + 'T12:00:00').getDay()];
  };

  // Horário padrão esperado por dia da semana (em minutos desde meia-noite)
  // Sexta: 8h, demais dias úteis: 9h
  // Para a tolerância CLT precisamos do horário "nominal" de entrada/saída.
  // Como o app não tem horário contratado fixo, usamos a própria marcação como
  // referência — mas descontamos variações ≤5min nas bordas de almoço.
  const calculateHours = (entry, lunchOut, lunchIn, exit, dayOfWeek) => {
    if (!entry || !exit) return 0;

    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const entryMin = toMin(entry);
    const exitMin = toMin(exit);

    let totalMinutes = 0;

    if (lunchOut && lunchIn) {
      const lunchOutMin = toMin(lunchOut);
      const lunchInMin = toMin(lunchIn);

      // Tolerância CLT nas bordas de almoço (5 min)
      // Se o funcionário voltou até 5min antes/depois → arredonda para o horário nominal
      const adjLunchOut = applyTolerance(lunchOut, lunchOutMin); // sem referência externa — usa bruto
      const adjLunchIn = applyTolerance(lunchIn, lunchInMin);

      // Manhã
      totalMinutes += adjLunchOut - entryMin;
      // Tarde
      totalMinutes += exitMin - adjLunchIn;
    } else {
      // Sem almoço registrado → desconta 1h automática
      let rawMinutes = exitMin - entryMin;
      if (rawMinutes < 0) rawMinutes += 1440;
      totalMinutes = rawMinutes - 60;
    }

    // Tolerância CLT na entrada e saída:
    // Determina o horário "esperado" com base nas horas da jornada
    // (sexta = 8h, demais = 9h), usando a própria entrada como âncora.
    const expectedWorkHours = dayOfWeek === 5 ? 8 : 9;
    const lunchDuration = (lunchOut && lunchIn)
      ? (toMin(lunchIn) - toMin(lunchOut))
      : 60;
    // Horário nominal de saída
    const nominalExit = entryMin + (expectedWorkHours * 60) + lunchDuration;

    // Aplica tolerância na saída: se saiu até 5min antes ou depois do nominal
    const adjExitMin = applyTolerance(exit, nominalExit);
    if (adjExitMin !== null && adjExitMin !== exitMin) {
      // Recalcula a diferença que a tolerância gera
      const diff = adjExitMin - exitMin;
      totalMinutes += diff;
    }

    return Math.max(0, totalMinutes / 60);
  };

  const handleSuggestedExit = (entry, date) => {
    if (!entry) { setSuggestedExit(''); return; }
    const [h, m] = entry.split(':').map(Number);
    const day = new Date(date + 'T12:00:00').getDay();
    const needed = (day === 5) ? 8 : 9;
    const exitMin = (h * 60 + m) + (needed * 60) + 60;
    const outH = Math.floor(exitMin / 60) % 24;
    const outM = exitMin % 60;
    setSuggestedExit(`${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`);
  };

  const addEntry = () => {
    if (!currentEntry.date) { alert('Selecione uma data'); return; }

    const day = new Date(currentEntry.date + 'T12:00:00').getDay();
    const expected = (day === 0 || day === 6) ? 0 : (day === 5 ? 8 : 9);

    let worked = 0;
    if (!currentEntry.isAbsence && currentEntry.entry && currentEntry.exit) {
      worked = calculateHours(
        currentEntry.entry,
        currentEntry.lunchOut,
        currentEntry.lunchIn,
        currentEntry.exit,
        day
      );
      if (currentEntry.isHalfDay) worked = worked / 2;
    }

    const newEntry = {
      ...currentEntry,
      dayOfWeek: getDayOfWeek(currentEntry.date),
      workedHours: worked,
      expectedHours: expected,
      overtime: worked - expected
    };

    const existingIndex = entries.findIndex(e => e.date === currentEntry.date);

    if (existingIndex !== -1 && editingIndex === null) {
      if (window.confirm(`Já existe um registro para ${new Date(currentEntry.date + 'T12:00:00').toLocaleDateString('pt-BR')}. Deseja substituir?`)) {
        const updated = [...entries];
        updated[existingIndex] = newEntry;
        updated.sort((a, b) => new Date(b.date) - new Date(a.date));
        setEntries(updated);
      } else return;
    } else {
      let updated = [...entries];
      if (editingIndex !== null) {
        updated[editingIndex] = newEntry;
        setEditingIndex(null);
      } else {
        updated.push(newEntry);
      }
      updated.sort((a, b) => new Date(b.date) - new Date(a.date));
      setEntries(updated);
    }

    setCurrentEntry({
      date: new Date().toISOString().split('T')[0],
      entry: '', lunchOut: '', lunchIn: '', exit: '',
      isHalfDay: false, isAbsence: false
    });
    setSuggestedExit('');
  };

  const deleteEntry = (i) => {
    if (window.confirm('Deseja excluir?')) {
      const updated = [...entries];
      updated.splice(i, 1);
      setEntries(updated);
    }
  };

  const getWeekDates = useCallback((date = new Date()) => {
    const currentDate = new Date(date);
    currentDate.setHours(12, 0, 0, 0);

    const dayOfWeek = currentDate.getDay();

    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    return { monday, friday };
  }, []);

  const getCurrentWeekDates = useCallback(() => {
    return getWeekDates(new Date());
  }, [getWeekDates]);

  const getPreviousWeekDates = useCallback(() => {
    const previousWeek = new Date();
    previousWeek.setDate(previousWeek.getDate() - 7);
    return getWeekDates(previousWeek);
  }, [getWeekDates]);

  // ── Registros do mês atual ────────────────────────────────────────────────
  const currentMonthEntries = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    return entries
      .filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  const summary = useMemo(() => {
    const totals = entries.reduce((acc, e) => ({
      worked: acc.worked + e.workedHours,
      overtime: acc.overtime + e.overtime
    }), { worked: 0, overtime: 0 });

    const autoCompensated = Math.max(0, totals.overtime);

    const { monday: cM, friday: cF } = getCurrentWeekDates();
    const currentWeekHours = entries
      .filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        const dw = d.getDay();
        if (dw === 0 || dw === 6) return false;
        return d >= cM && d <= cF;
      })
      .reduce((sum, e) => sum + e.workedHours, 0);

    const { monday: pM, friday: pF } = getPreviousWeekDates();
    const previousWeekHours = entries
      .filter(e => {
        const d = new Date(e.date + 'T12:00:00');
        const dw = d.getDay();
        if (dw === 0 || dw === 6) return false;
        return d.getTime() >= pM.getTime() && d.getTime() <= pF.getTime();
      })
      .reduce((sum, e) => sum + e.workedHours, 0);

    return { ...totals, autoCompensated, currentWeekHours, previousWeekHours };
  }, [entries, getCurrentWeekDates, getPreviousWeekDates]);

  const handleSignIn = async () => {
    if (!authEmail || !authPassword || authSubmitting) return;
    setAuthError('');
    setAuthSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    setAuthSubmitting(false);
  };

  const handleSignUp = async () => {
    if (!authEmail || !authPassword || authSubmitting) return;
    setAuthError('');
    setAuthSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: { data: { full_name: authName } }
    });
    if (error) setAuthError(error.message);
    else setAuthError('Verifique seu e-mail para confirmar o cadastro.');
    setAuthSubmitting(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleImportLocalData = () => {
    if (!localBackup) return;
    const merged = [...entries];
    localBackup.entries.forEach(localEntry => {
      if (!merged.some(e => e.date === localEntry.date)) merged.push(localEntry);
    });
    merged.sort((a, b) => new Date(b.date) - new Date(a.date));
    setEntries(merged);
    if (localBackup.hoursGoal && !hoursGoal.total) setHoursGoal(localBackup.hoursGoal);
    localStorage.setItem('supabase_migration_done', '1');
    setLocalBackup(null);
  };

  const handleDismissLocalImport = () => {
    localStorage.setItem('supabase_migration_done', '1');
    setLocalBackup(null);
  };

  const handleResetAccumulatedBalance = () => {
    if (window.confirm('Isso vai zerar o saldo acumulado (horas extras ou em débito) de todos os registros. Os registros de ponto não serão apagados, apenas o saldo. Essa ação não pode ser desfeita. Deseja continuar?')) {
      setEntries(entries.map(e => ({ ...e, overtime: 0 })));
    }
  };

  if (authLoading) {
    return <div className={`flex items-center justify-center h-screen ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-slate-50 text-gray-800'}`}>Carregando...</div>;
  }

  if (!session) {
    const isSignUp = authMode === 'signup';
    return (
      <div className={`flex items-center justify-center h-screen ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-slate-50 text-gray-800'}`}>
        <form
          className={`w-80 space-y-3 p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}
          onSubmit={(e) => { e.preventDefault(); isSignUp ? handleSignUp() : handleSignIn(); }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className={darkMode ? "text-blue-400" : "text-blue-600"} size={24} />
            <h1 className="text-lg font-bold">Controle de Ponto</h1>
          </div>
          <p className={`text-sm -mt-1 mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
            {isSignUp ? 'Crie sua conta para começar' : 'Entre com sua conta'}
          </p>
          {isSignUp && (
            <input className={`w-full border p-2 rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`}
              type="text" placeholder="Nome" autoComplete="name"
              value={authName} onChange={(e) => setAuthName(e.target.value)} />
          )}
          <input className={`w-full border p-2 rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`}
            type="email" placeholder="E-mail" autoComplete="email"
            value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
          <input className={`w-full border p-2 rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`}
            type="password" placeholder="Senha" autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <button type="submit" disabled={authSubmitting} className="w-full bg-blue-600 disabled:opacity-60 text-white p-2 rounded font-bold">
            {authSubmitting ? (isSignUp ? 'Criando conta...' : 'Entrando...') : (isSignUp ? 'Criar conta' : 'Entrar')}
          </button>
          <button type="button" disabled={authSubmitting}
            onClick={() => { setAuthMode(isSignUp ? 'signin' : 'signup'); setAuthError(''); }}
            className={`w-full text-sm font-medium p-2 rounded disabled:opacity-60 ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-slate-100'}`}>
            {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta'}
          </button>
        </form>
      </div>
    );
  }

  const getProgressPercentage = () => {
    if (hoursGoal.total <= 0) return 0;
    const compensated = Math.max(0, summary.autoCompensated || 0);
    return Math.min(100, (compensated / hoursGoal.total) * 100);
  };

  const getProgressColor = () => {
    const p = getProgressPercentage();
    if (p >= 100) return 'bg-emerald-500';
    if (p >= 70) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const exportMonthToCSV = () => {
    const [year, month] = reportMonth.split('-');
    const filtered = sortedEntries.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
    });

    if (filtered.length === 0) { alert('Nenhum registro encontrado para este período'); return; }

    const headers = ['Data','Dia da Semana','Entrada','Saída Almoço','Retorno Almoço','Saída','Horas Trabalhadas','Horas Esperadas','Saldo','Tipo'];
    const rows = filtered.map(e => [
      new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR'),
      e.dayOfWeek, e.entry || '-', e.lunchOut || '-', e.lunchIn || '-', e.exit || '-',
      formatHoursMinutes(e.workedHours), formatHoursMinutes(e.expectedHours),
      (e.overtime > 0 ? '+' : '') + formatHoursMinutes(e.overtime),
      e.isAbsence ? 'Falta/Dispensa' : e.isHalfDay ? 'Meio Período' : 'Completo'
    ]);

    const totals = filtered.reduce((acc, e) => ({
      worked: acc.worked + e.workedHours,
      expected: acc.expected + e.expectedHours,
      overtime: acc.overtime + e.overtime
    }), { worked: 0, expected: 0, overtime: 0 });

    rows.push(['','','','','','','','','','']);
    rows.push(['TOTAIS','','','','','',formatHoursMinutes(totals.worked),formatHoursMinutes(totals.expected),(totals.overtime > 0 ? '+' : '') + formatHoursMinutes(totals.overtime),'']);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ponto_${year}_${month}.csv`;
    link.click();
  };

  // Mês atual formatado para exibição
  const currentMonthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const displayName = session?.user?.user_metadata?.full_name || session?.user?.email || '';

  const renderHomePage = () => (
    <>
      {/* FORMULÁRIO */}
      <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
        <div className={`flex items-center gap-3 mb-6 pb-4 border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
          <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-900/50' : 'bg-blue-100'}`}>
            <Clock className={darkMode ? "text-blue-400" : "text-blue-600"} size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Registro de Ponto</h2>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Preencha os horários do dia</p>
          </div>
        </div>

        <div className="rounded-xl p-2">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Data</label>
              <input type="date" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`}
                value={currentEntry.date}
                onChange={e => setCurrentEntry({...currentEntry, date: e.target.value})} />
            </div>
            {!currentEntry.isAbsence && (
              <>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Entrada</label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`}
                    value={currentEntry.entry}
                    onChange={e => { setCurrentEntry({...currentEntry, entry: e.target.value}); handleSuggestedExit(e.target.value, currentEntry.date); }} />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                    <Utensils size={12} /> Saída Almoço
                  </label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`}
                    value={currentEntry.lunchOut}
                    onChange={e => setCurrentEntry({...currentEntry, lunchOut: e.target.value})} />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>Opcional</p>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                    <Utensils size={12} /> Retorno Almoço
                  </label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`}
                    value={currentEntry.lunchIn}
                    onChange={e => setCurrentEntry({...currentEntry, lunchIn: e.target.value})} />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>Opcional</p>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Saída</label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`}
                    value={currentEntry.exit}
                    onChange={e => setCurrentEntry({...currentEntry, exit: e.target.value})} />
                  {suggestedExit && <p className={`text-xs font-bold mt-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Sugestão: {suggestedExit}</p>}
                </div>
              </>
            )}
            <div className="flex items-end gap-2">
              <button onClick={addEntry} className={`flex-1 p-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 ${editingIndex !== null ? 'bg-orange-500' : 'bg-blue-600'}`}>
                {editingIndex !== null ? <Save size={20}/> : <Plus size={20}/>}
                {editingIndex !== null ? 'Atualizar' : 'Lançar'}
              </button>
              {editingIndex !== null && (
                <button onClick={() => { setEditingIndex(null); setCurrentEntry({ date: new Date().toISOString().split('T')[0], entry: '', lunchOut: '', lunchIn: '', exit: '', isHalfDay: false, isAbsence: false }); }}
                  className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-slate-100'}`}>
                  <X size={20}/>
                </button>
              )}
            </div>
          </div>
          <div className="mt-6 flex gap-6 text-sm font-medium">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={currentEntry.isHalfDay}
                onChange={e => setCurrentEntry({...currentEntry, isHalfDay: e.target.checked})} />
              Meio Período
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-red-400">
              <input type="checkbox" className="w-4 h-4 rounded" checked={currentEntry.isAbsence}
                onChange={e => setCurrentEntry({...currentEntry, isAbsence: e.target.checked})} />
              Falta / Dispensa
            </label>
          </div>

          {/* Nota CLT */}
          <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}`}>
            <div className="flex items-start gap-2">
              <Info size={15} className={`mt-0.5 flex-shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
                <span className="font-bold">CLT Art. 58 §1º:</span> Variações de até 5 minutos na entrada/saída não são computadas.{' '}
                Os campos de almoço são opcionais (1h descontada automaticamente se não preenchidos).{' '}
                Apenas um registro por dia é permitido.
              </p>
            </div>
          </div>
        </div>
      </div>

      {entries.length > 0 && (
        <>
          {/* CARDS SEMANA / SALDO */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Semana Atual — destaque */}
            <div className={`md:col-span-2 p-8 rounded-2xl shadow-lg border ${darkMode ? 'bg-gradient-to-br from-blue-900 to-blue-800 border-blue-700' : 'bg-gradient-to-br from-blue-600 to-blue-500 border-blue-400'} text-white`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={20} className="opacity-80" />
                <p className="text-sm font-bold uppercase opacity-80">Semana Atual</p>
                <span className="text-xs opacity-70">
                  ({new Date(getCurrentWeekDates().monday).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})} –{' '}
                  {new Date(getCurrentWeekDates().friday).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})})
                </span>
              </div>
              <p className="text-5xl font-black mb-1">{formatHoursMinutes(summary.currentWeekHours || 0)}</p>
              <p className="text-sm opacity-90 mb-4">de 44h semanais (seg a sex)</p>
              <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-blue-950/50' : 'bg-blue-700/30'}`}>
                <div className="h-full bg-white/80 transition-all duration-500"
                  style={{ width: `${Math.min((summary.currentWeekHours / 44) * 100, 100)}%` }}></div>
              </div>
              <p className="text-xs opacity-70 mt-2">
                {Math.min((summary.currentWeekHours / 44) * 100, 100).toFixed(1)}% da meta semanal
                {summary.currentWeekHours > 44 && ' · ⚡ Meta batida!'}
              </p>
            </div>

            {/* Semana Anterior */}
            <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
              <div className="flex flex-col gap-1 mb-2">
                <p className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Semana Anterior</p>
                <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                  {new Date(getPreviousWeekDates().monday).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})} –{' '}
                  {new Date(getPreviousWeekDates().friday).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})}
                </span>
              </div>
              <p className="text-2xl font-black">{formatHoursMinutes(summary.previousWeekHours || 0)}</p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>de 44h semanais</p>
              <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-slate-200'}`}>
                <div className={`h-full ${darkMode ? 'bg-gray-400' : 'bg-slate-400'} transition-all duration-500`}
                  style={{ width: `${Math.min((summary.previousWeekHours / 44) * 100, 100)}%` }}></div>
              </div>
            </div>

            {/* Saldo acumulado */}
            <div className={`p-6 rounded-2xl shadow-lg border ${summary.overtime >= 0
              ? (darkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-100')
              : (darkMode ? 'bg-red-900/20 border-red-800' : 'bg-rose-50 border-rose-100')}`}>
              <p className={`text-xs font-bold uppercase mb-2 ${summary.overtime >= 0
                ? (darkMode ? 'text-emerald-400' : 'text-emerald-600')
                : (darkMode ? 'text-red-400' : 'text-red-600')}`}>Saldo Acumulado</p>
              <p className={`text-2xl font-black ${summary.overtime >= 0
                ? (darkMode ? 'text-emerald-300' : 'text-emerald-700')
                : (darkMode ? 'text-red-300' : 'text-red-700')}`}>
                {summary.overtime > 0 ? '+' : ''}{formatHoursMinutes(summary.overtime)}
              </p>
              <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                {summary.overtime >= 0 ? 'Horas extras acumuladas' : 'Horas em débito'}
              </p>
              {summary.overtime !== 0 && (
                <button onClick={handleResetAccumulatedBalance}
                  className={`mt-3 w-full text-xs font-bold py-1.5 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${darkMode ? 'border-gray-700 text-gray-400 hover:bg-gray-700/50' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                  <Eraser size={14} /> Zerar saldo acumulado
                </button>
              )}
            </div>
          </div>

          {/* REGISTROS DO MÊS ATUAL */}
          <div className={`rounded-2xl shadow-lg overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'} flex justify-between items-center`}>
              <div>
                <h3 className="text-lg font-bold capitalize">
                  Registros de {currentMonthLabel}
                </h3>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                  {currentMonthEntries.length} registro{currentMonthEntries.length !== 1 ? 's' : ''} este mês
                </p>
              </div>
              {currentMonthEntries.length > 0 && (
                <div className={`text-sm font-bold px-3 py-1 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-slate-100'}`}>
                  Total: {formatHoursMinutes(currentMonthEntries.reduce((s, e) => s + e.workedHours, 0))}
                </div>
              )}
            </div>

            {currentMonthEntries.length === 0 ? (
              <div className={`p-10 text-center ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                Nenhum registro para {currentMonthLabel}.
              </div>
            ) : (
              <table className="w-full">
                <thead className={darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}>
                  <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                    <th className="px-6 py-4 text-xs font-bold uppercase text-left">Data</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase text-left">Período</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase text-center">Horas Trabalhadas</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase text-center">Saldo</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMonthEntries.map((entry, i) => (
                    <tr key={i} className={`border-b ${darkMode ? 'border-gray-700/50 hover:bg-gray-700/50' : 'border-slate-100 hover:bg-slate-50'} ${entry.isAbsence ? (darkMode ? 'bg-red-900/20' : 'bg-red-50/30') : ''}`}>
                      <td className="px-6 py-4">
                        <span className="block font-bold">{new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        <span className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{entry.dayOfWeek}</span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {entry.isAbsence ? (
                          <span className={`font-bold ${darkMode ? 'text-red-400' : 'text-red-500'}`}>FALTA / DISPENSA</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div><span className="font-medium">Entrada:</span> {entry.entry}</div>
                            <div><span className="font-medium">Almoço:</span> {entry.lunchOut || '–'} → {entry.lunchIn || '–'}</div>
                            <div><span className="font-medium">Saída:</span> {entry.exit}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                        {entry.isAbsence ? '–' : formatHoursMinutes(entry.workedHours)}
                      </td>
                      <td className={`px-6 py-4 text-center font-black ${entry.overtime >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {entry.overtime > 0 ? '+' : ''}{formatHoursMinutes(entry.overtime)}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => {
                          const index = sortedEntries.findIndex(e => e.date === entry.date && e.entry === entry.entry);
                          setEditingIndex(index);
                          setCurrentEntry(entry);
                        }} className="p-2 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors">
                          <Edit2 size={16}/>
                        </button>
                        <button onClick={() => {
                          const index = sortedEntries.findIndex(e => e.date === entry.date && e.entry === entry.entry);
                          deleteEntry(index);
                        }} className="p-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors">
                          <Trash2 size={16}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* META DE HORAS */}
          <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-6">
              <Target className={darkMode ? "text-blue-400" : "text-indigo-600"} size={24} />
              <h2 className="text-lg font-bold">Meta de Horas a Compensar</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Total de horas a compensar</label>
                <input type="number" step="0.5" min="0"
                  className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`}
                  value={hoursGoal.total || ''}
                  onChange={e => setHoursGoal({...hoursGoal, total: Math.max(0, parseFloat(e.target.value) || 0)})} />
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Data limite</label>
                <input type="date"
                  className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`}
                  value={hoursGoal.deadline}
                  onChange={e => setHoursGoal({...hoursGoal, deadline: e.target.value})} />
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Progresso: {formatHoursMinutes(summary.autoCompensated || 0)} / {formatHoursMinutes(hoursGoal.total)}</span>
                <span className="text-sm font-bold">{getProgressPercentage().toFixed(1)}%</span>
              </div>
              <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-slate-200'}`}>
                <div className={`h-full ${getProgressColor()} transition-all duration-500`} style={{ width: `${getProgressPercentage()}%` }}></div>
              </div>
              {getProgressPercentage() >= 100 && (
                <div className={`flex items-center gap-2 mt-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">Meta concluída! 🎉</span>
                </div>
              )}
              <p className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                💡 Suas horas extras positivas são contabilizadas automaticamente
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderReportsPage = () => (
    <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center gap-3 mb-6 pb-4 border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
        <div className={`p-2 rounded-lg ${darkMode ? 'bg-green-900/50' : 'bg-green-100'}`}>
          <FileText className={darkMode ? "text-green-400" : "text-green-600"} size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold">Relatórios e Exportação</h2>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Exporte todos os registros para análise</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}`}>
          <h3 className="text-lg font-bold mb-3">Exportar Relatório Mensal (CSV)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Selecione o mês</label>
              <input type="month"
                className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`}
                value={reportMonth}
                onChange={e => setReportMonth(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button onClick={exportMonthToCSV}
                className={`w-full p-3 rounded-lg font-bold flex items-center justify-center gap-2 ${darkMode ? 'bg-green-700 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'} text-white transition-colors`}>
                <Download size={20} /> Exportar CSV
              </button>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}`}>
          <h3 className="text-lg font-bold mb-3">Estatísticas Gerais</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Total de Registros</p>
              <p className="text-2xl font-bold">{entries.length}</p>
            </div>
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Período Abrangido</p>
              <p className="text-lg font-bold">
                {entries.length > 0
                  ? `${new Date(entries[entries.length-1].date + 'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(entries[0].date + 'T12:00:00').toLocaleDateString('pt-BR')}`
                  : 'Nenhum registro'}
              </p>
            </div>
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Horas Totais Trabalhadas</p>
              <p className="text-2xl font-bold">{formatHoursMinutes(summary.worked)}</p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-bold">Registros Completos ({entries.length})</h3>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Do mais recente ao mais antigo</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                  <th className="py-2 px-3 text-left">Data</th>
                  <th className="py-2 px-3 text-left">Entrada</th>
                  <th className="py-2 px-3 text-left">Almoço</th>
                  <th className="py-2 px-3 text-left">Saída</th>
                  <th className="py-2 px-3 text-right">Horas</th>
                  <th className="py-2 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, i) => (
                  <tr key={i} className={`border-b ${darkMode ? 'border-gray-800 hover:bg-gray-700/30' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <td className="py-2 px-3">
                      {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{entry.dayOfWeek}</div>
                    </td>
                    <td className="py-2 px-3">{entry.entry || '–'}</td>
                    <td className="py-2 px-3">
                      {entry.lunchOut && entry.lunchIn ? `${entry.lunchOut} → ${entry.lunchIn}` : '1h automática'}
                    </td>
                    <td className="py-2 px-3">{entry.exit || '–'}</td>
                    <td className={`py-2 px-3 text-right font-bold ${entry.overtime >= 0 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                      {formatHoursMinutes(entry.workedHours)}
                    </td>
                    <td className="py-2 px-3 text-right space-x-2">
                      <button onClick={() => {
                        const index = entries.findIndex(e => e.date === entry.date && e.entry === entry.entry);
                        setEditingIndex(index);
                        setCurrentEntry(entry);
                        setCurrentPage('home');
                      }} className={`p-1.5 rounded ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-500 hover:bg-slate-100'}`}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => {
                        const index = entries.findIndex(e => e.date === entry.date && e.entry === entry.entry);
                        if (window.confirm(`Deseja excluir o registro de ${new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}?`)) deleteEntry(index);
                      }} className={`p-1.5 rounded ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-500 hover:bg-slate-100'}`}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length === 0 && (
              <p className={`text-center py-4 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Nenhum registro encontrado</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentPage) {
      case 'home': return renderHomePage();
      case 'reports': return renderReportsPage();
      default: return renderHomePage();
    }
  };

  return (
    <div className={`min-h-screen flex ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-slate-50 text-gray-800'}`}>

      {/* SIDEBAR */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'} border-r`}>
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
          <h2 className="text-xl font-bold">Menu</h2>
          <button onClick={() => setSidebarOpen(false)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100'}`}>
            <ChevronLeft size={20} />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {[
            { id: 'home', label: 'Início', Icon: Home },
            { id: 'reports', label: 'Relatórios', Icon: FileText }
          ].map(({ id, label, Icon }) => (
            <button key={id}
              onClick={() => { setCurrentPage(id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                currentPage === id
                  ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                  : (darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-slate-100 text-slate-700')
              }`}>
              <Icon size={20} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)}></div>}

      {/* MAIN */}
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* HEADER */}
          <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'} flex flex-col md:flex-row justify-between items-center gap-4`}>
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100'}`}>
                <Menu size={24} />
              </button>
              <div className={`p-3 rounded-xl text-white ${darkMode ? 'bg-blue-600' : 'bg-indigo-600'}`}>
                <Calendar size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-black">Controle de Ponto</h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                  {currentPage === 'home' ? `Mês atual · ${entries.length} registro${entries.length !== 1 ? 's' : ''} no total` : 'Relatórios completos'} · Sincronizado
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`hidden sm:block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
                Olá, {displayName}
              </span>
              <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-slate-200 text-gray-700'}`}>
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={() => window.location.reload()} className={`p-2 rounded-full ${darkMode ? 'text-gray-300' : 'text-slate-400'}`}>
                <RefreshCw size={20}/>
              </button>
              <button onClick={() => { if(window.confirm('Limpar todos os registros?')) setEntries([]); }} className="p-2 rounded-full text-red-400">
                <Trash2 size={20}/>
              </button>
              <button onClick={handleSignOut} title="Sair" className={`p-2 rounded-full ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                <LogOut size={20}/>
              </button>
            </div>
          </div>

          {cloudDataLoaded && localBackup && (
            <div className={`p-4 rounded-2xl shadow-lg border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${darkMode ? 'bg-amber-900/20 border-amber-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              <p className="text-sm">
                Encontramos <strong>{localBackup.entries.length}</strong> registro{localBackup.entries.length !== 1 ? 's' : ''} salvo{localBackup.entries.length !== 1 ? 's' : ''} neste navegador, de antes da sincronização com a nuvem. Deseja importá-los para esta conta?
              </p>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={handleImportLocalData} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-bold whitespace-nowrap">
                  Importar
                </button>
                <button onClick={handleDismissLocalImport} className={`px-3 py-1.5 rounded-lg border text-sm font-medium whitespace-nowrap ${darkMode ? 'border-amber-700' : 'border-amber-300'}`}>
                  Ignorar
                </button>
              </div>
            </div>
          )}

          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default TimesheetControl;

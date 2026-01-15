import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar, Save, Edit2, X, Target, RefreshCw, AlertCircle, CheckCircle, Moon, Sun, Clock, Menu, Home, FileText, Download, ChevronLeft, Utensils } from 'lucide-react';

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
  const [saveStatus, setSaveStatus] = useState('Sincronizado');
  const [editingIndex, setEditingIndex] = useState(null);
  const [hoursGoal, setHoursGoal] = useState({ total: 0, deadline: '', hoursPaid: 0 });
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (isInitialLoad.current) {
      try {
        const savedEntries = localStorage.getItem('timesheet_entries');
        if (savedEntries) setEntries(JSON.parse(savedEntries));
        const savedGoal = localStorage.getItem('hours_goal');
        if (savedGoal) setHoursGoal(JSON.parse(savedGoal));
        const savedDarkMode = localStorage.getItem('dark_mode');
        if (savedDarkMode !== null) setDarkMode(JSON.parse(savedDarkMode));
      } catch (e) {
        console.error("Erro ao carregar", e);
      }
      isInitialLoad.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isInitialLoad.current) {
      localStorage.setItem('timesheet_entries', JSON.stringify(entries));
      localStorage.setItem('hours_goal', JSON.stringify(hoursGoal));
      localStorage.setItem('dark_mode', JSON.stringify(darkMode));
    }
  }, [entries, hoursGoal, darkMode]);

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

  const calculateHours = (entry, lunchOut, lunchIn, exit) => {
    if (!entry || !exit) return 0;
    
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    
    // Calcula o tempo total de trabalho
    let totalMinutes = 0;
    
    // Se tem horários de almoço preenchidos
    if (lunchOut && lunchIn) {
      // Manhã: entrada até saída para almoço
      totalMinutes += toMin(lunchOut) - toMin(entry);
      // Tarde: retorno do almoço até saída
      totalMinutes += toMin(exit) - toMin(lunchIn);
    } else {
      // Se não tem horários de almoço, considera 1 hora automaticamente
      let rawMinutes = toMin(exit) - toMin(entry);
      if (rawMinutes < 0) rawMinutes += 1440;
      totalMinutes = rawMinutes - 60; // Desconta 1 hora de almoço
    }
    
    return totalMinutes / 60;
  };

  const handleSuggestedExit = (entry, date) => {
    if (!entry) { setSuggestedExit(''); return; }
    const [h, m] = entry.split(':').map(Number);
    const day = new Date(date + 'T12:00:00').getDay();
    const needed = (day === 5) ? 8 : 9;
    
    // Considera 1 hora de almoço + horas necessárias
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
        currentEntry.exit
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
    
    let updated = [...entries];
    if (editingIndex !== null) {
      updated[editingIndex] = newEntry;
      setEditingIndex(null);
    } else {
      updated.push(newEntry);
    }
    
    updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    setEntries(updated);
    
    setCurrentEntry({ 
      date: new Date().toISOString().split('T')[0], 
      entry: '', 
      lunchOut: '',
      lunchIn: '',
      exit: '', 
      isHalfDay: false, 
      isAbsence: false 
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

  const getCurrentWeekDates = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  };

  const getPreviousWeekDates = () => {
    const { monday } = getCurrentWeekDates();
    const prevSunday = new Date(monday);
    prevSunday.setDate(monday.getDate() - 1);
    const prevMonday = new Date(prevSunday);
    prevMonday.setDate(prevSunday.getDate() - 6);
    return { monday: prevMonday, sunday: prevSunday };
  };

  // Últimos 10 registros para exibição na tela inicial
  const lastTenEntries = useMemo(() => {
    return entries.slice(0, 10);
  }, [entries]);

  // Todos os registros ordenados por data (do mais recente para o mais antigo)
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  const summary = useMemo(() => {
    const totals = entries.reduce((acc, e) => ({
      worked: acc.worked + e.workedHours,
      overtime: acc.overtime + e.overtime
    }), { worked: 0, overtime: 0 });

    // Calcula horas compensadas automaticamente (apenas as positivas)
    const autoCompensated = Math.max(0, totals.overtime);

    // Calcula horas da semana atual
    const { monday: currentMonday, sunday: currentSunday } = getCurrentWeekDates();
    const currentWeekHours = entries
      .filter(entry => {
        const entryDate = new Date(entry.date + 'T12:00:00');
        return entryDate >= currentMonday && entryDate <= currentSunday;
      })
      .reduce((sum, entry) => sum + entry.workedHours, 0);

    // Calcula horas da semana anterior
    const { monday: prevMonday, sunday: prevSunday } = getPreviousWeekDates();
    const previousWeekHours = entries
      .filter(entry => {
        const entryDate = new Date(entry.date + 'T12:00:00');
        return entryDate >= prevMonday && entryDate <= prevSunday;
      })
      .reduce((sum, entry) => sum + entry.workedHours, 0);

    return { ...totals, autoCompensated, currentWeekHours, previousWeekHours };
  }, [entries]);

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
      const entryDate = new Date(e.date + 'T12:00:00');
      return entryDate.getFullYear() === parseInt(year) && 
             (entryDate.getMonth() + 1) === parseInt(month);
    });

    if (filtered.length === 0) {
      alert('Nenhum registro encontrado para este período');
      return;
    }

    const headers = ['Data', 'Dia da Semana', 'Entrada', 'Saída Almoço', 'Retorno Almoço', 'Saída', 'Horas Trabalhadas', 'Horas Esperadas', 'Saldo', 'Tipo'];
    const rows = filtered.map(e => [
      new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR'),
      e.dayOfWeek,
      e.entry || '-',
      e.lunchOut || '-',
      e.lunchIn || '-',
      e.exit || '-',
      formatHoursMinutes(e.workedHours),
      formatHoursMinutes(e.expectedHours),
      (e.overtime > 0 ? '+' : '') + formatHoursMinutes(e.overtime),
      e.isAbsence ? 'Falta/Dispensa' : e.isHalfDay ? 'Meio Período' : 'Completo'
    ]);

    const totals = filtered.reduce((acc, e) => ({
      worked: acc.worked + e.workedHours,
      expected: acc.expected + e.expectedHours,
      overtime: acc.overtime + e.overtime
    }), { worked: 0, expected: 0, overtime: 0 });

    rows.push(['', '', '', '', '', '', '', '', '', '']);
    rows.push(['TOTAIS', '', '', '', '', '', formatHoursMinutes(totals.worked), formatHoursMinutes(totals.expected), (totals.overtime > 0 ? '+' : '') + formatHoursMinutes(totals.overtime), '']);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ponto_${year}_${month}.csv`;
    link.click();
  };

  const renderHomePage = () => (
    <>
      <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
          <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-900/50' : 'bg-blue-100'}`}>
            <Clock className={darkMode ? "text-blue-400" : "text-blue-600"} size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Registro de Ponto</h2>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Preencha os horários do dia</p>
          </div>
        </div>

        <div className="rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Data</label>
              <input type="date" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`} value={currentEntry.date} onChange={e => setCurrentEntry({...currentEntry, date: e.target.value})} />
            </div>
            {!currentEntry.isAbsence && (
              <>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Entrada</label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`} value={currentEntry.entry} onChange={e => { setCurrentEntry({...currentEntry, entry: e.target.value}); handleSuggestedExit(e.target.value, currentEntry.date); }} />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                    <Utensils size={12} />
                    Saída Almoço
                  </label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`} value={currentEntry.lunchOut} onChange={e => setCurrentEntry({...currentEntry, lunchOut: e.target.value})} />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>Opcional</p>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                    <Utensils size={12} />
                    Retorno Almoço
                  </label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`} value={currentEntry.lunchIn} onChange={e => setCurrentEntry({...currentEntry, lunchIn: e.target.value})} />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>Opcional</p>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Saída</label>
                  <input type="time" className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200'}`} value={currentEntry.exit} onChange={e => setCurrentEntry({...currentEntry, exit: e.target.value})} />
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
                <button onClick={() => { setEditingIndex(null); setCurrentEntry({ date: new Date().toISOString().split('T')[0], entry: '', lunchOut: '', lunchIn: '', exit: '', isHalfDay: false, isAbsence: false }); }} className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-slate-100'}`}>
                  <X size={20}/>
                </button>
              )}
            </div>
          </div>
          <div className="mt-6 flex gap-6 text-sm font-medium">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" checked={currentEntry.isHalfDay} onChange={e => setCurrentEntry({...currentEntry, isHalfDay: e.target.checked})} />
              Meio Período
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-red-400">
              <input type="checkbox" className="w-4 h-4 rounded" checked={currentEntry.isAbsence} onChange={e => setCurrentEntry({...currentEntry, isAbsence: e.target.checked})} />
              Falta / Dispensa
            </label>
          </div>
          <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}`}>
            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
              <span className="font-bold">Nota:</span> Os campos de almoço são opcionais. Se não preencher, será considerado 1 hora automaticamente.
            </p>
          </div>
        </div>
      </div>

      {entries.length > 0 && (
        <>
          <div className={`rounded-2xl shadow-lg overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'} flex justify-between items-center`}>
              <h3 className="text-lg font-bold">Últimos 10 Registros</h3>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                Total de registros: {entries.length}
              </span>
            </div>
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-900/50' : 'bg-slate-50'}>
                <tr className="border-b">
                  <th className="px-6 py-4 text-xs font-bold uppercase text-left">Data</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-left">Período</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-center">Horas Trabalhadas</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-center">Saldo</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lastTenEntries.map((entry, i) => (
                  <tr key={i} className={`${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-slate-50'} ${entry.isAbsence ? (darkMode ? 'bg-red-900/20' : 'bg-red-50/30') : ''}`}>
                    <td className="px-6 py-4">
                      <span className="block font-bold">{new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      <span className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{entry.dayOfWeek}</span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {entry.isAbsence ? (
                        <span className={`font-bold ${darkMode ? 'text-red-400' : 'text-red-500'}`}>FALTA/DISPENSA</span>
                      ) : (
                        <div>
                          <div><span className="font-medium">Entrada:</span> {entry.entry}</div>
                          <div><span className="font-medium">Almoço:</span> {entry.lunchOut || '-'} → {entry.lunchIn || '-'}</div>
                          <div><span className="font-medium">Saída:</span> {entry.exit}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-bold">{entry.isAbsence ? '-' : formatHoursMinutes(entry.workedHours)}</td>
                    <td className={`px-6 py-4 text-center font-black ${entry.overtime >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {entry.overtime > 0 ? '+' : ''}{formatHoursMinutes(entry.overtime)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => { setEditingIndex(sortedEntries.findIndex(e => e.date === entry.date && e.entry === entry.entry)); setCurrentEntry(entry); }} className={`p-2 rounded-lg ${darkMode ? 'text-blue-400' : 'text-blue-400'}`}><Edit2 size={16}/></button>
                      <button onClick={() => deleteEntry(sortedEntries.findIndex(e => e.date === entry.date && e.entry === entry.entry))} className={`p-2 rounded-lg ${darkMode ? 'text-red-400' : 'text-red-400'}`}><Trash2 size={16}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className={`md:col-span-2 p-8 rounded-2xl shadow-lg border ${darkMode ? 'bg-gradient-to-br from-blue-900 to-blue-800 border-blue-700' : 'bg-gradient-to-br from-blue-600 to-blue-500 border-blue-400'} text-white`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={20} className="opacity-80" />
                <p className="text-sm font-bold uppercase opacity-80">Semana Atual</p>
              </div>
              <p className="text-5xl font-black mb-2">{formatHoursMinutes(summary.currentWeekHours || 0)}</p>
              <p className="text-sm opacity-90">de 44h semanais</p>
              <div className={`mt-4 h-2 rounded-full overflow-hidden ${darkMode ? 'bg-blue-950/50' : 'bg-blue-700/30'}`}>
                <div 
                  className="h-full bg-white/80 transition-all duration-500" 
                  style={{ width: `${Math.min((summary.currentWeekHours / 44) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            
            <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase mb-2 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>Semana Anterior</p>
              <p className="text-2xl font-black">{formatHoursMinutes(summary.previousWeekHours || 0)}</p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>de 44h semanais</p>
            </div>
            
            <div className={`p-6 rounded-2xl shadow-lg border ${summary.overtime >= 0 ? (darkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-100') : (darkMode ? 'bg-red-900/20 border-red-800' : 'bg-rose-50 border-rose-100')}`}>
              <p className={`text-xs font-bold uppercase mb-2 ${summary.overtime >= 0 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>Saldo Acumulado</p>
              <p className={`text-2xl font-black ${summary.overtime >= 0 ? (darkMode ? 'text-emerald-300' : 'text-emerald-700') : (darkMode ? 'text-red-300' : 'text-red-700')}`}>{summary.overtime > 0 ? '+' : ''}{formatHoursMinutes(summary.overtime)}</p>
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderReportsPage = () => (
    <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
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
              <input 
                type="month" 
                className={`w-full rounded-lg p-3 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300'}`} 
                value={reportMonth} 
                onChange={e => setReportMonth(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button 
                onClick={exportMonthToCSV} 
                className={`w-full p-3 rounded-lg font-bold flex items-center justify-center gap-2 ${darkMode ? 'bg-green-700 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'} text-white transition-colors`}
              >
                <Download size={20} />
                Exportar CSV
              </button>
            </div>
          </div>
          <p className={`text-xs mt-3 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
            O arquivo CSV conterá todos os registros do mês selecionado, incluindo horários de almoço e totais.
          </p>
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
                  ? `${new Date(entries[entries.length - 1].date + 'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(entries[0].date + 'T12:00:00').toLocaleDateString('pt-BR')}`
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
          <h3 className="text-lg font-bold mb-3">Registros Completos ({entries.length} registros)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                  <th className="py-2 px-3 text-left">Data</th>
                  <th className="py-2 px-3 text-left">Entrada</th>
                  <th className="py-2 px-3 text-left">Almoço</th>
                  <th className="py-2 px-3 text-left">Saída</th>
                  <th className="py-2 px-3 text-right">Horas</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.slice(0, 20).map((entry, i) => (
                  <tr key={i} className={`border-b ${darkMode ? 'border-gray-800' : 'border-slate-100'}`}>
                    <td className="py-2 px-3">
                      {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>{entry.dayOfWeek}</div>
                    </td>
                    <td className="py-2 px-3">{entry.entry || '-'}</td>
                    <td className="py-2 px-3">
                      {entry.lunchOut && entry.lunchIn ? `${entry.lunchOut} → ${entry.lunchIn}` : '1h automática'}
                    </td>
                    <td className="py-2 px-3">{entry.exit || '-'}</td>
                    <td className={`py-2 px-3 text-right font-bold ${entry.overtime >= 0 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                      {formatHoursMinutes(entry.workedHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > 20 && (
            <p className={`text-xs mt-3 text-center ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              Mostrando 20 de {entries.length} registros. Exporte o CSV para ver todos.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentPage) {
      case 'home':
        return renderHomePage();
      case 'reports':
        return renderReportsPage();
      default:
        return renderHomePage();
    }
  };

  return (
    <div className={`min-h-screen flex ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-slate-50 text-gray-800'}`}>
      
      {/* SIDEBAR */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'} border-r`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold">Menu</h2>
          <button onClick={() => setSidebarOpen(false)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100'}`}>
            <ChevronLeft size={20} />
          </button>
        </div>
        
        <nav className="p-4 space-y-2">
          <button 
            onClick={() => { setCurrentPage('home'); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentPage === 'home' 
                ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                : (darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-slate-100 text-slate-700')
            }`}
          >
            <Home size={20} />
            Início
          </button>
          
          <button 
            onClick={() => { setCurrentPage('reports'); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentPage === 'reports' 
                ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                : (darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-slate-100 text-slate-700')
            }`}
          >
            <FileText size={20} />
            Relatórios
          </button>
        </nav>
      </div>

      {/* OVERLAY */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className={`p-6 rounded-2xl shadow-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'} flex flex-col md:flex-row justify-between items-center gap-4`}>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(true)} 
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100'}`}
              >
                <Menu size={24} />
              </button>
              <div className={`p-3 rounded-xl text-white ${darkMode ? 'bg-blue-600' : 'bg-indigo-600'}`}>
                <Calendar size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-black">Controle de Ponto</h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                  {currentPage === 'home' ? 'Últimos 10 registros' : 'Relatórios completos'} • {saveStatus}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 text-yellow-300' : 'bg-slate-200 text-gray-700'}`}>
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={() => window.location.reload()} className={`p-2 rounded-full ${darkMode ? 'text-gray-300' : 'text-slate-400'}`}>
                <RefreshCw size={20}/>
              </button>
              <button onClick={() => { if(window.confirm('Limpar todos os registros?')) setEntries([]); }} className={`p-2 rounded-full ${darkMode ? 'text-red-400' : 'text-red-400'}`}>
                <Trash2 size={20}/>
              </button>
            </div>
          </div>

          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default TimesheetControl;
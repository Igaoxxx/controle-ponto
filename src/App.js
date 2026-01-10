import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar, Save, Edit2, X, Target, RefreshCw, AlertCircle, CheckCircle, Moon, Sun, Clock } from 'lucide-react';
import './index.css';

const TimesheetControl = () => {
  // --- ESTADOS ---
  const [entries, setEntries] = useState([]);
  const [currentEntry, setCurrentEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    entry: '',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    exit: '',
    isHalfDay: false,
    isAbsence: false
  });
  const [suggestedExit, setSuggestedExit] = useState('');
  const [saveStatus, setSaveStatus] = useState('Sincronizado com navegador');
  const [editingIndex, setEditingIndex] = useState(null);
  const [hoursGoal, setHoursGoal] = useState({
    total: 0,
    deadline: '',
    hoursPaid: 0
  });
  const [darkMode, setDarkMode] = useState(true);
  
  // Refs para evitar loops
  const isInitialLoad = useRef(true);
  const lastSaveTime = useRef(0);

  // --- EFEITOS (Persistência) ---
  useEffect(() => {
    // Carregar dados apenas uma vez
    if (isInitialLoad.current) {
      try {
        const savedEntries = localStorage.getItem('timesheet_entries');
        if (savedEntries) {
          setEntries(JSON.parse(savedEntries));
        }
        
        const savedGoal = localStorage.getItem('hours_goal');
        if (savedGoal) {
          setHoursGoal(JSON.parse(savedGoal));
        }
        
        const savedDarkMode = localStorage.getItem('dark_mode');
        if (savedDarkMode !== null) {
          setDarkMode(JSON.parse(savedDarkMode));
        }
        
        setSaveStatus('✓ Dados carregados');
        setTimeout(() => {
          setSaveStatus('Sincronizado com navegador');
        }, 2000);
      } catch (e) {
        console.error("Erro ao carregar dados", e);
      }
      isInitialLoad.current = false;
    }
  }, []); // SEM DEPENDÊNCIAS - roda apenas uma vez

  // Efeito separado para salvar dados (com debounce)
  useEffect(() => {
    // Não salvar durante carregamento inicial
    if (isInitialLoad.current) return;
    
    // Debounce: espera 500ms antes de salvar
    const now = Date.now();
    if (now - lastSaveTime.current < 500) return;
    
    lastSaveTime.current = now;
    
    const saveTimer = setTimeout(() => {
      try {
        localStorage.setItem('timesheet_entries', JSON.stringify(entries));
        localStorage.setItem('hours_goal', JSON.stringify(hoursGoal));
        localStorage.setItem('dark_mode', JSON.stringify(darkMode));
      } catch (e) {
        console.error("Erro ao salvar dados", e);
      }
    }, 500);
    
    return () => clearTimeout(saveTimer);
  }, [entries, hoursGoal, darkMode]); // Dependências específicas

  // Aplicar tema ao body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }, [darkMode]);

  // --- HELPER FUNCTIONS ---
  const formatHoursMinutes = (decimalHours) => {
    if (decimalHours === 0) return '0h00m';
    const absolute = Math.abs(decimalHours);
    const h = Math.floor(absolute);
    const m = Math.round((absolute - h) * 60);
    return `${decimalHours < 0 ? '-' : ''}${h}h${m.toString().padStart(2, '0')}m`;
  };

  const getDayOfWeek = (dateString) => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const date = new Date(dateString + 'T12:00:00');
    return days[date.getDay()];
  };

  const calculateHours = (entry, exit) => {
    if (!entry || !exit) return 0;
    
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const entryMin = toMin(entry);
    const exitMin = toMin(exit);
    let totalMin = exitMin - entryMin;
    if (totalMin < 0) totalMin += 1440;

    // Subtrai 1h de almoço (fixo conforme seu design)
    const workedMin = totalMin - 60; // 60 minutos = 1 hora
    
    return workedMin / 60; // Retorna em horas decimais
  };

  const handleSuggestedExit = (entry, date, isHalfDay) => {
    if (!entry || isHalfDay) { 
      setSuggestedExit(''); 
      return; 
    }
    const [h, m] = entry.split(':').map(Number);
    const day = new Date(date + 'T12:00:00').getDay();
    const needed = (day === 5) ? 8 : 9; 
    const exitMin = (h * 60 + m) + (needed * 60) + 60; // +60min de almoço padrão
    const outH = Math.floor(exitMin / 60) % 24;
    const outM = exitMin % 60;
    setSuggestedExit(`${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`);
  };

  // --- FUNÇÕES PARA HORAS A PAGAR ---
  const updateHoursPaid = (hoursToAdd) => {
    setHoursGoal(prev => ({
      ...prev,
      hoursPaid: Math.max(0, Math.min(prev.total, prev.hoursPaid + hoursToAdd))
    }));
  };

  const getProgressPercentage = () => {
    if (hoursGoal.total <= 0) return 0;
    return Math.min(100, (hoursGoal.hoursPaid / hoursGoal.total) * 100);
  };

  const getProgressColor = () => {
    const percentage = getProgressPercentage();
    if (percentage >= 100) return 'bg-emerald-500';
    if (percentage >= 70) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const getDaysUntilDeadline = () => {
    if (!hoursGoal.deadline) return null;
    const today = new Date();
    const deadline = new Date(hoursGoal.deadline);
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleClearGoal = () => {
    if (window.confirm('Deseja limpar toda a meta de horas?')) {
      setHoursGoal({
        total: 0,
        deadline: '',
        hoursPaid: 0
      });
    }
  };

  // --- AÇÕES PRINCIPAIS ---
  const addEntry = () => {
    if (!currentEntry.date) {
      alert('Selecione uma data');
      return;
    }

    const day = new Date(currentEntry.date + 'T12:00:00').getDay();
    const expected = (day === 0 || day === 6) ? 0 : (day === 5 ? 8 : 9);
    
    let worked = 0;
    if (!currentEntry.isAbsence && currentEntry.entry && currentEntry.exit) {
      worked = calculateHours(currentEntry.entry, currentEntry.exit);
      if (currentEntry.isHalfDay) {
        worked = worked / 2; // Meio período = metade das horas
      }
    }

    const newEntry = {
      ...currentEntry,
      dayOfWeek: getDayOfWeek(currentEntry.date),
      workedHours: worked,
      expectedHours: expected,
      overtime: worked - expected
    };

    let updatedEntries = [...entries];
    if (editingIndex !== null) {
      updatedEntries[editingIndex] = newEntry;
      setEditingIndex(null);
      setSaveStatus('✓ Registro atualizado');
    } else {
      updatedEntries.push(newEntry);
      setSaveStatus('✓ Registro adicionado');
    }

    // Ordenar por data
    updatedEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
    setEntries(updatedEntries);
    
    // Resetar formulário
    setCurrentEntry({ 
      date: new Date().toISOString().split('T')[0], 
      entry: '', 
      lunchStart: '12:00', 
      lunchEnd: '13:00', 
      exit: '', 
      isHalfDay: false, 
      isAbsence: false 
    });
    setSuggestedExit('');
    
    // Resetar status após 2 segundos
    setTimeout(() => {
      setSaveStatus('Sincronizado com navegador');
    }, 2000);
  };

  const deleteEntry = (index) => {
    if (window.confirm('Deseja excluir este registro?')) {
      const newEntries = entries.filter((_, i) => i !== index);
      setEntries(newEntries);
      setSaveStatus('✓ Registro excluído');
      setTimeout(() => {
        setSaveStatus('Sincronizado com navegador');
      }, 2000);
    }
  };

  const summary = useMemo(() => {
    const total = entries.reduce((acc, curr) => ({
      worked: acc.worked + curr.workedHours,
      overtime: acc.overtime + curr.overtime
    }), { worked: 0, overtime: 0 });

    return { ...total };
  }, [entries]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-slate-50 text-gray-800'} p-4 md:p-8 font-sans`}>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className={`p-6 rounded-2xl shadow-lg ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'} border transition-colors duration-300 flex flex-col md:flex-row justify-between items-center gap-4`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-blue-600' : 'bg-indigo-600'} text-white`}>
              <Calendar size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Controle de Ponto</h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                {saveStatus}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-yellow-300' : 'bg-slate-200 hover:bg-slate-300 text-gray-700'} transition-all duration-300`}
              title={darkMode ? "Modo claro" : "Modo escuro"}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <button 
              onClick={() => {
                setSaveStatus('↻ Atualizando...');
                setTimeout(() => {
                  setSaveStatus('Sincronizado com navegador');
                }, 1000);
              }} 
              className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-slate-100 text-slate-400'}`}
              title="Atualizar visualização"
            >
              <RefreshCw size={20}/>
            </button>
            
            <button 
              onClick={() => { 
                if(window.confirm('Tem certeza que deseja apagar TODOS os registros?')) {
                  setEntries([]);
                  setSaveStatus('✓ Todos registros removidos');
                  setTimeout(() => {
                    setSaveStatus('Sincronizado com navegador');
                  }, 2000);
                }
              }} 
              className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-400'}`}
              title="Limpar todos registros"
            >
              <Trash2 size={20}/>
            </button>
          </div>
        </div>
        {/* SEÇÃO: REGISTROS DE PONTO */}
        <div className={`p-6 rounded-2xl shadow-lg border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-900/50' : 'bg-blue-100'}`}>
              <Clock className={darkMode ? "text-blue-400" : "text-blue-600"} size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Registros</h2>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                Preencha os campos abaixo para registrar seu ponto diário
              </p>
            </div>
          </div>

          <div className={`rounded-xl p-6 border-2 transition-all ${editingIndex !== null ? 'border-orange-500' : darkMode ? 'border-gray-700' : 'border-transparent'}`}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                  Data
                </label>
                <input 
                  type="date" 
                  className={`w-full rounded-lg p-3 transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'} border`}
                  value={currentEntry.date} 
                  onChange={e => setCurrentEntry({...currentEntry, date: e.target.value})} 
                />
              </div>
              {!currentEntry.isAbsence && (
                <>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                      Entrada
                    </label>
                    <input 
                      type="time" 
                      className={`w-full rounded-lg p-3 transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'} border`}
                      value={currentEntry.entry} 
                      onChange={e => {
                        setCurrentEntry({...currentEntry, entry: e.target.value});
                        handleSuggestedExit(e.target.value, currentEntry.date, currentEntry.isHalfDay);
                      }} 
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                      Saída
                    </label>
                    <input 
                      type="time" 
                      className={`w-full rounded-lg p-3 transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-200 text-slate-800'} border`}
                      value={currentEntry.exit} 
                      onChange={e => setCurrentEntry({...currentEntry, exit: e.target.value})} 
                    />
                    {suggestedExit && (
                      <p className={`text-[10px] font-bold mt-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        Sugestão: {suggestedExit}
                      </p>
                    )}
                  </div>
                </>
              )}
              <div className="flex items-end gap-2">
                <button 
                  onClick={addEntry} 
                  className={`flex-1 p-3 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 ${editingIndex !== null ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {editingIndex !== null ? <Save size={20}/> : <Plus size={20}/>}
                  {editingIndex !== null ? 'Atualizar' : 'Lançar'}
                </button>
                {editingIndex !== null && (
                  <button 
                    onClick={() => {
                      setEditingIndex(null);
                      setCurrentEntry({ 
                        date: new Date().toISOString().split('T')[0], 
                        entry: '', 
                        lunchStart: '12:00', 
                        lunchEnd: '13:00', 
                        exit: '', 
                        isHalfDay: false, 
                        isAbsence: false 
                      });
                      setSuggestedExit('');
                    }} 
                    className={`p-3 rounded-lg transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <X size={20}/>
                  </button>
                )}
              </div>
            </div>
            <div className="mt-6 flex gap-6 text-sm font-medium">
              <label className={`flex items-center gap-2 cursor-pointer select-none ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
                <input 
                  type="checkbox" 
                  className={`w-4 h-4 rounded transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-blue-500' : 'bg-white border-slate-300 text-blue-600'}`}
                  checked={currentEntry.isHalfDay} 
                  onChange={e => setCurrentEntry({...currentEntry, isHalfDay: e.target.checked})} 
                />
                Meio Período
              </label>
              <label className={`flex items-center gap-2 cursor-pointer select-none ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                <input 
                  type="checkbox" 
                  className={`w-4 h-4 rounded transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-red-500' : 'bg-white border-slate-300 text-red-600'}`}
                  checked={currentEntry.isAbsence} 
                  onChange={e => setCurrentEntry({...currentEntry, isAbsence: e.target.checked})} 
                />
                Falta / Dispensa
              </label>
            </div>
          </div>
        </div>

        {/* TABELA DE REGISTROS */}
        {entries.length > 0 ? (
          <div className={`rounded-2xl shadow-lg overflow-hidden border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className={darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-slate-50 border-slate-200'}>
                  <tr className="border-b">
                    <th className="px-6 py-4 text-xs font-bold uppercase">Data</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase">Período</th>
                    <th className="px-6 py-4 text-center text-xs font-bold uppercase">Trabalhadas</th>
                    <th className="px-6 py-4 text-center text-xs font-bold uppercase">Saldo</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {entries.map((entry, index) => (
                    <tr 
                      key={index} 
                      className={`transition-colors duration-200 ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-slate-50/80'} ${entry.isAbsence ? (darkMode ? 'bg-red-900/20' : 'bg-red-50/30') : ''}`}
                    >
                      <td className="px-6 py-4">
                        <span className="block font-bold">{new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        <span className={`text-[10px] font-bold uppercase ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                          {entry.dayOfWeek}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {entry.isAbsence ? (
                          <span className={`font-bold ${darkMode ? 'text-red-400' : 'text-red-500'}`}>
                            FALTA/DISPENSA
                          </span>
                        ) : (
                          <span className={darkMode ? 'text-gray-300' : 'text-slate-600'}>
                            {entry.entry} → {entry.exit}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                        {entry.isAbsence ? '-' : formatHoursMinutes(entry.workedHours)}
                      </td>
                      <td className={`px-6 py-4 text-center font-black ${entry.overtime >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {entry.overtime > 0 ? '+' : ''}{formatHoursMinutes(entry.overtime)}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button 
                          onClick={() => { 
                            setEditingIndex(index); 
                            setCurrentEntry(entries[index]); 
                          }} 
                          className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-blue-400 hover:bg-blue-900/30' : 'text-blue-400 hover:bg-blue-50'}`}
                        >
                          <Edit2 size={16}/>
                        </button>
                        <button 
                          onClick={() => deleteEntry(index)} 
                          className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-400 hover:bg-red-50'}`}
                        >
                          <Trash2 size={16}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={`p-8 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
            <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              Nenhum registro adicionado ainda. Use o formulário acima para começar!
            </p>
          </div>
        )}
{/* SEÇÃO: HORAS A PAGAR */}
        <div className={`p-6 rounded-2xl shadow-lg border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100'}`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-900/50' : 'bg-indigo-100'}`}>
                <Target className={darkMode ? "text-blue-400" : "text-indigo-600"} size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold">Meta de Horas a Compensar</h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                  Total de horas a compensar
                </p>
              </div>
            </div>
            <button 
              onClick={handleClearGoal}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'} border`}
            >
              Limpar Meta
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className={`block text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                Total de horas a compensar
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  step="0.5"
                  min="0"
                  className={`flex-1 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300 text-slate-800 border'}`}
                  value={hoursGoal.total || ''}
                  onChange={e => setHoursGoal({...hoursGoal, total: Math.max(0, parseFloat(e.target.value) || 0)})}
                  placeholder="0"
                />
                <span className={`font-medium ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>horas</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className={`block text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                Data limite para compensação
              </label>
              <input 
                type="date" 
                className={`w-full rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-slate-300 text-slate-800 border'}`}
                value={hoursGoal.deadline}
                onChange={e => setHoursGoal({...hoursGoal, deadline: e.target.value})}
              />
              {hoursGoal.deadline && (
                <div className="flex items-center gap-2 text-sm">
                  {getDaysUntilDeadline() > 0 ? (
                    <>
                      <AlertCircle size={14} className="text-blue-400" />
                      <span className={darkMode ? "text-blue-300" : "text-blue-600"}>
                        Faltam {getDaysUntilDeadline()} dia{getDaysUntilDeadline() !== 1 ? 's' : ''}
                      </span>
                    </>
                  ) : getDaysUntilDeadline() === 0 ? (
                    <>
                      <AlertCircle size={14} className="text-amber-500" />
                      <span className={darkMode ? "text-amber-300" : "text-amber-600"}>Vence hoje!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} className="text-red-500" />
                      <span className={darkMode ? "text-red-400" : "text-red-600"}>
                        Vencido há {Math.abs(getDaysUntilDeadline())} dia{Math.abs(getDaysUntilDeadline()) !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className={`block text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                Horas já compensadas
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  step="0.5"
                  min="0"
                  max={hoursGoal.total}
                  className={`flex-1 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-emerald-300' : 'bg-white border-slate-300 text-emerald-700 border'}`}
                  value={hoursGoal.hoursPaid || ''}
                  onChange={e => {
                    const value = parseFloat(e.target.value) || 0;
                    setHoursGoal({...hoursGoal, hoursPaid: Math.min(value, hoursGoal.total)});
                  }}
                  placeholder="0"
                />
                <span className={`font-medium ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>horas</span>
                <button 
                  onClick={() => updateHoursPaid(0.5)}
                  className={`px-3 py-1 rounded-lg font-medium text-sm transition-colors ${darkMode ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                >
                  +0.5h
                </button>
              </div>
            </div>
          </div>

          {/* BARRA DE PROGRESSO */}
          <div className="mt-6 space-y-2">
            <div className="flex justify-between items-center">
              <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
                Progresso: {hoursGoal.hoursPaid.toFixed(1)}h / {hoursGoal.total.toFixed(1)}h
              </span>
              <span className={`text-sm font-bold ${getProgressPercentage() >= 100 ? 'text-emerald-400' : darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                {getProgressPercentage().toFixed(1)}%
              </span>
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-slate-200'}`}>
              <div 
                className={`h-full ${getProgressColor()} transition-all duration-500 ease-out`}
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
            {getProgressPercentage() >= 100 && (
              <div className={`flex items-center gap-2 mt-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                <CheckCircle size={16} />
                <span className="text-sm font-medium">Meta concluída! 🎉</span>
              </div>
            )}
          </div>
        </div>
        {/* RESUMO FINAL */}
        {entries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`p-6 rounded-2xl shadow-lg border transition-colors duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
              <p className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                Total Trabalhado
              </p>
              <p className="text-3xl font-black mt-2">{formatHoursMinutes(summary.worked)}</p>
            </div>
            
            <div className={`p-6 rounded-2xl shadow-lg border transition-colors duration-300 ${summary.overtime >= 0 ? (darkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-100') : (darkMode ? 'bg-red-900/20 border-red-800' : 'bg-rose-50 border-rose-100')}`}>
              <p className={`text-xs font-bold uppercase ${summary.overtime >= 0 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                Saldo Acumulado
              </p>
              <p className={`text-3xl font-black mt-2 ${summary.overtime >= 0 ? (darkMode ? 'text-emerald-300' : 'text-emerald-700') : (darkMode ? 'text-red-300' : 'text-red-700')}`}>
                {summary.overtime > 0 ? '+' : ''}{formatHoursMinutes(summary.overtime)}
              </p>
            </div>
            
            <div className={`p-6 rounded-2xl shadow-lg text-white transition-colors duration-300 ${darkMode ? 'bg-blue-900 border-blue-800' : 'bg-blue-600 border-blue-500'} border`}>
              <p className="text-xs font-bold uppercase opacity-80">Horas Restantes</p>
              <p className="text-3xl font-black mt-2">
                {Math.max(0, hoursGoal.total - hoursGoal.hoursPaid).toFixed(1)}h
              </p>
              <p className="text-sm opacity-90 mt-1">
                de {hoursGoal.total.toFixed(1)}h totais
              </p>
            </div>
          </div>
        )}

        {/* NOTA DE SALVAMENTO */}
        <div className={`rounded-xl p-4 border transition-colors duration-300 ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-emerald-500' : 'bg-emerald-400'}`}></div>
            <span className={`font-medium ${darkMode ? 'text-gray-300' : 'text-slate-600'}`}>
              Salvamento Automático Ativado!
            </span>
            <span className={darkMode ? 'text-gray-400' : 'text-slate-500'}>
              Seus dados são salvos automaticamente e ficam armazenados no seu navegador.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TimesheetControl;
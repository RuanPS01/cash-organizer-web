import { useEffect, useState } from 'react';
import { Banknote, BarChart3, Plus, Settings } from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import { AddExpenseScreen } from './components/AddExpenseScreen';
import { MonthScreen } from './components/MonthScreen';
import { ManageScreen } from './components/ManageScreen';
import { BrandMark } from './components/shared';
import { clearSession, restoreSession } from './services/session';
import { setViewPrefs } from './services/compartments';
import type { ViewPrefs } from './services/compartments';
import { ensureMonth } from './services/months';
import { useConfig, useMonthData } from './hooks/useMonthData';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import type { Compartment } from './types';

type View = 'add' | 'stats' | 'payment' | 'manage';

function Shell(props: { compartment: Compartment; onLogout: () => void }) {
  const [view, setView] = useState<View>('add');
  const [currentMonth, setCurrentMonth] = useState(props.compartment.currentMonth);
  const { categories, fixedExpenses, origins, monthlyIncome } = useConfig(props.compartment.id);
  const monthData = useMonthData(props.compartment.id, currentMonth);
  // As preferências do card de estatísticas da aba Adicionar (aba aberta,
  // categoria e origem acompanhadas) vivem aqui para não voltar às guardadas no
  // compartimento cada vez que o usuário troca de tela.
  const [prefs, setPrefs] = useState<ViewPrefs>({
    weekCategoryId: props.compartment.weekCategoryId ?? null,
    weekOriginId: props.compartment.weekOriginId ?? null,
    addStatsTab: props.compartment.addStatsTab ?? 'month',
  });

  const changePrefs = (patch: Partial<ViewPrefs>) => {
    setPrefs((atual) => ({ ...atual, ...patch }));
    // É preferência de leitura: se a gravação falhar, a tela já está mostrando
    // a escolha e a próxima abertura volta para a anterior.
    setViewPrefs(props.compartment.id, patch).catch(() => undefined);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <BrandMark />
          <span className="brand-name">Cash Organizer</span>
        </span>
        <span className="compartment">
          <span className="name">{props.compartment.name}</span>
          <button className="btn ghost small" onClick={props.onLogout}>
            Sair
          </button>
        </span>
      </header>

      <main className="content">
        {view === 'add' && (
          <AddExpenseScreen
            compartmentId={props.compartment.id}
            currentMonth={currentMonth}
            categories={categories}
            origins={origins}
            data={monthData}
            prefs={prefs}
            onPrefsChange={changePrefs}
          />
        )}
        {view === 'stats' && (
          <MonthScreen
            compartmentId={props.compartment.id}
            currentMonth={currentMonth}
            mode="stats"
            origins={origins}
            onCurrentMonthChange={setCurrentMonth}
          />
        )}
        {view === 'payment' && (
          <MonthScreen
            compartmentId={props.compartment.id}
            currentMonth={currentMonth}
            mode="payment"
            origins={origins}
            onCurrentMonthChange={setCurrentMonth}
          />
        )}
        {view === 'manage' && (
          <ManageScreen
            compartmentId={props.compartment.id}
            currentMonth={currentMonth}
            fixedExpenses={fixedExpenses}
            categories={categories}
            origins={origins}
            monthlyIncome={monthlyIncome}
            monthData={monthData}
          />
        )}
      </main>

      <nav className="navbar">
        <button className={view === 'add' ? 'active' : ''} onClick={() => setView('add')}>
          <span className="nav-icon">
            <Plus size={20} aria-hidden />
          </span>
          Adicionar
        </button>
        <button className={view === 'stats' ? 'active' : ''} onClick={() => setView('stats')}>
          <span className="nav-icon">
            <BarChart3 size={20} aria-hidden />
          </span>
          Estatísticas
        </button>
        <button className={view === 'payment' ? 'active' : ''} onClick={() => setView('payment')}>
          <span className="nav-icon">
            <Banknote size={20} aria-hidden />
          </span>
          Pagamento
        </button>
        <button className={view === 'manage' ? 'active' : ''} onClick={() => setView('manage')}>
          <span className="nav-icon">
            <Settings size={20} aria-hidden />
          </span>
          Gerenciar
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  const [compartment, setCompartment] = useState<Compartment | null>(null);
  const [restoring, setRestoring] = useState(true);
  // Precisa ficar aqui, e não no Shell: o hook mede o viewport da janela toda e
  // vale desde o login, onde o teclado também abre.
  useKeyboardInset();

  useEffect(() => {
    restoreSession()
      .then(async (c) => {
        if (c) {
          await ensureMonth(c.id, c.currentMonth);
          setCompartment(c);
        }
      })
      .finally(() => setRestoring(false));
  }, []);

  if (restoring) {
    return (
      <div className="login-wrap">
        <div className="login-card center">
          <div className="login-logo">
            <BrandMark big />
          </div>
          <p className="muted">Abrindo seu compartimento…</p>
        </div>
      </div>
    );
  }

  if (!compartment) {
    return <LoginScreen onEnter={setCompartment} />;
  }

  return (
    <Shell
      compartment={compartment}
      onLogout={() => {
        clearSession();
        setCompartment(null);
      }}
    />
  );
}

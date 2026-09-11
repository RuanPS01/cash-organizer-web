import { useEffect, useState } from 'react';
import { Banknote, BarChart3, Plus, Settings } from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import { AddExpenseScreen } from './components/AddExpenseScreen';
import { MonthScreen } from './components/MonthScreen';
import { ManageScreen } from './components/ManageScreen';
import { BrandMark } from './components/shared';
import { clearSession, restoreSession } from './services/session';
import { setWeekCategory } from './services/compartments';
import { ensureMonth } from './services/months';
import { useConfig, useMonthData } from './hooks/useMonthData';
import type { Compartment } from './types';

type View = 'add' | 'stats' | 'payment' | 'manage';

function Shell(props: { compartment: Compartment; onLogout: () => void }) {
  const [view, setView] = useState<View>('add');
  const [currentMonth, setCurrentMonth] = useState(props.compartment.currentMonth);
  const { categories, fixedExpenses, origins } = useConfig(props.compartment.id);
  const monthData = useMonthData(props.compartment.id, currentMonth);
  // A categoria acompanhada no card da semana vive aqui para não voltar à
  // guardada no compartimento cada vez que o usuário troca de aba.
  const [weekCategoryId, setWeekCategoryId] = useState<string | null>(
    props.compartment.weekCategoryId ?? null,
  );

  const changeWeekCategory = (categoryId: string) => {
    setWeekCategoryId(categoryId);
    // É preferência de leitura: se a gravação falhar, a tela já está mostrando
    // a categoria escolhida e a próxima abertura volta para a anterior.
    setWeekCategory(props.compartment.id, categoryId).catch(() => undefined);
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
            weekCategoryId={weekCategoryId}
            onWeekCategoryChange={changeWeekCategory}
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

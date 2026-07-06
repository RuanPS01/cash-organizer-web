import { useEffect, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { AddExpenseScreen } from './components/AddExpenseScreen';
import { MonthScreen } from './components/MonthScreen';
import { ManageScreen } from './components/ManageScreen';
import { clearSession, restoreSession } from './services/session';
import { ensureMonth } from './services/months';
import { useConfig, useMonthData } from './hooks/useMonthData';
import type { Compartment } from './types';

type View = 'add' | 'month' | 'manage';

function Shell(props: { compartment: Compartment; onLogout: () => void }) {
  const [view, setView] = useState<View>('add');
  const [currentMonth, setCurrentMonth] = useState(props.compartment.currentMonth);
  const { categories, fixedExpenses } = useConfig(props.compartment.id);
  const monthData = useMonthData(props.compartment.id, currentMonth);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">💸 Cash Organizer</span>
        <span className="compartment">
          {props.compartment.name}
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
            data={monthData}
          />
        )}
        {view === 'month' && (
          <MonthScreen
            compartmentId={props.compartment.id}
            currentMonth={currentMonth}
            onMonthClosed={setCurrentMonth}
          />
        )}
        {view === 'manage' && (
          <ManageScreen
            compartmentId={props.compartment.id}
            currentMonth={currentMonth}
            fixedExpenses={fixedExpenses}
            categories={categories}
          />
        )}
      </main>

      <nav className="navbar">
        <button className={view === 'add' ? 'active' : ''} onClick={() => setView('add')}>
          <span className="nav-icon">＋</span>
          Adicionar
        </button>
        <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
          <span className="nav-icon">📋</span>
          Mês
        </button>
        <button className={view === 'manage' ? 'active' : ''} onClick={() => setView('manage')}>
          <span className="nav-icon">⚙️</span>
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
          <div className="login-logo">💸</div>
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

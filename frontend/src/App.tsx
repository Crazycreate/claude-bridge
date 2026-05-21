import { useEffect, useMemo, useState } from 'react';
import { useBridge } from './hooks/useBridge';
import { useGitStatus } from './hooks/useGitStatus';
import { clearToken, loadToken, saveToken } from './lib/storage';
import { ChatArea } from './components/ChatArea';
import { Composer } from './components/Composer';
import { NewSessionDialog } from './components/NewSessionDialog';
import { OpenSessionDialog } from './components/OpenSessionDialog';
import { QuickActions } from './components/QuickActions';
import { Sidebar } from './components/Sidebar';
import { StatsBar } from './components/StatsBar';
import { Topbar } from './components/Topbar';
import { TokenGate } from './components/TokenGate';

export default function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const bridge = useBridge(token);

  // All hooks must run before the early return — React's Rules of Hooks
  // require the same hook order on every render.
  const active = bridge.sessions.find((s) => s.id === bridge.activeId);
  // Bump the git fetch trigger each time Claude finishes a turn. The result
  // count (whose UI lives in StatsBar) reflects this faithfully.
  const gitRefreshKey = useMemo(() => bridge.stats.turns, [bridge.stats.turns]);
  const git = useGitStatus(active?.cwd ?? null, gitRefreshKey);

  // A rejected token must drop us back to the gate.
  useEffect(() => {
    if (bridge.authError) {
      clearToken();
      setToken(null);
    }
  }, [bridge.authError]);

  if (!token) {
    return (
      <TokenGate
        error={bridge.authError}
        onSubmit={(t) => {
          saveToken(t);
          setToken(t);
        }}
      />
    );
  }

  const closeDrawer = (): void => setDrawerOpen(false);

  return (
    <div className="app">
      {drawerOpen && <div className="scrim" onClick={closeDrawer} />}

      <Sidebar
        sessions={bridge.sessions}
        activeId={bridge.activeId}
        conn={bridge.conn}
        open={drawerOpen}
        onClose={closeDrawer}
        onNew={() => {
          closeDrawer();
          setDialogOpen(true);
        }}
        onSelect={(id) => {
          bridge.selectSession(id);
          closeDrawer();
        }}
        onDelete={bridge.deleteSession}
        onRename={bridge.renameSession}
      />

      <div className="main">
        <Topbar
          title={active?.title ?? 'Claude Bridge'}
          cwd={active?.cwd}
          status={bridge.claudeStatus}
          model={active?.model ?? ''}
          git={git}
          onMenu={() => setDrawerOpen(true)}
          onOpen={() => setOpenDialogOpen(true)}
          onInterrupt={bridge.interrupt}
          onModelChange={bridge.setModel}
        />
        <ChatArea items={bridge.items} status={bridge.claudeStatus} onDecide={bridge.sendPermission} />
        <StatsBar stats={bridge.stats} />
        <QuickActions disabled={bridge.conn !== 'online'} onSend={bridge.sendPrompt} />
        <Composer
          onSend={bridge.sendPrompt}
          disabled={bridge.conn !== 'online'}
          sessionId={bridge.activeId}
        />
      </div>

      {dialogOpen && (
        <NewSessionDialog
          defaultCwd={bridge.defaultCwd}
          onClose={() => setDialogOpen(false)}
          onCreate={(cwd, resumeId) => {
            bridge.newSession(cwd, resumeId);
            setDialogOpen(false);
          }}
        />
      )}

      {openDialogOpen && (
        <OpenSessionDialog
          defaultCwd={active?.cwd ?? bridge.defaultCwd}
          bridgeSessions={bridge.sessions}
          onClose={() => setOpenDialogOpen(false)}
          onOpenBridge={(id) => {
            bridge.selectSession(id);
            setOpenDialogOpen(false);
          }}
          onOpenCli={(cwd, sessionId) => {
            bridge.newSession(cwd, sessionId);
            setOpenDialogOpen(false);
          }}
          onDeleteBridge={bridge.deleteSession}
        />
      )}
    </div>
  );
}

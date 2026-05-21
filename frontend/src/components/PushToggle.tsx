import { useEffect, useState } from 'react';
import {
  currentSubscription,
  notificationPermission,
  pushSupported,
  sendTestPush,
  subscribeBrowser,
  unsubscribeBrowser,
} from '../lib/push';
import { IconBell, IconBellOff } from './icons';

type State = 'unsupported' | 'denied' | 'off' | 'on';

/**
 * Sidebar footer button that lets the user enable / disable push notifications
 * for this device. Tucked under the connection badge so it's discoverable but
 * never in the way.
 */
export function PushToggle() {
  const [state, setState] = useState<State>('off');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) {
      setState('unsupported');
      return;
    }
    if (notificationPermission() === 'denied') {
      setState('denied');
      return;
    }
    currentSubscription().then((s) => setState(s ? 'on' : 'off'));
  }, []);

  const toggle = async (): Promise<void> => {
    setError(null);
    setWorking(true);
    try {
      if (state === 'on') {
        await unsubscribeBrowser();
        setState('off');
      } else {
        await subscribeBrowser();
        setState('on');
        // Round-trip test so the user sees a real notification right away.
        await sendTestPush();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  if (state === 'unsupported') return null;

  const icon = state === 'on' ? <IconBell size={13} /> : <IconBellOff size={13} />;
  const label =
    state === 'on'
      ? '推送已开启'
      : state === 'denied'
        ? '通知已被系统禁用'
        : working
          ? '设置中…'
          : '开启推送通知';

  return (
    <>
      <button
        type="button"
        className="push-toggle"
        onClick={toggle}
        disabled={working || state === 'denied'}
      >
        {icon} {label}
      </button>
      {error && <div className="push-error">{error}</div>}
    </>
  );
}

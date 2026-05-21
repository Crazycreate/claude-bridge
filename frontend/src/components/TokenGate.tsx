import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { loadServerBase, saveServerBase } from '../lib/server';

interface Props {
  onSubmit: (token: string) => void;
  error: boolean;
}

/** The packaged app must be told where the bridge lives; the web build is not. */
const NATIVE = Capacitor.isNativePlatform();

/** First-run screen: collects the server address (native only) and AUTH_TOKEN. */
export function TokenGate({ onSubmit, error }: Props) {
  const [server, setServer] = useState(loadServerBase());
  const [token, setToken] = useState('');
  const [localErr, setLocalErr] = useState('');

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    if (NATIVE) {
      const s = server.trim();
      if (!/^https?:\/\/.+/.test(s)) {
        setLocalErr('服务器地址需以 http:// 或 https:// 开头');
        return;
      }
      saveServerBase(s);
    }
    setLocalErr('');
    onSubmit(t);
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="logo">C</div>
        <h2>连接到 Claude Bridge</h2>
        {NATIVE ? (
          <p>填写你的 bridge 服务器地址和访问令牌。两者只保存在本设备，不会上传。</p>
        ) : (
          <p>
            输入 bridge 服务器 <code>.env</code> 文件里的访问令牌。令牌仅保存在本设备浏览器中，不会上传。
          </p>
        )}
        {NATIVE && (
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            value={server}
            placeholder="http://192.168.1.5:8787"
            onChange={(e) => setServer(e.target.value)}
          />
        )}
        <input
          type="password"
          value={token}
          autoComplete="off"
          placeholder="AUTH_TOKEN"
          onChange={(e) => setToken(e.target.value)}
        />
        {(localErr || error) && (
          <div className="err">{localErr || '令牌被拒绝，请检查后重试。'}</div>
        )}
        <button type="submit">连接</button>
      </form>
    </div>
  );
}

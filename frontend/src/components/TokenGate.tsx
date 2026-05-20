import { useState } from 'react';

interface Props {
  onSubmit: (token: string) => void;
  error: boolean;
}

/** First-run screen: collects the shared AUTH_TOKEN before connecting. */
export function TokenGate({ onSubmit, error }: Props) {
  const [token, setToken] = useState('');

  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) onSubmit(token.trim());
        }}
      >
        <div className="logo">C</div>
        <h2>连接到 Claude Bridge</h2>
        <p>
          输入 bridge 服务器 <code>.env</code> 文件里的访问令牌。令牌仅保存在本设备浏览器中，不会上传。
        </p>
        {error && <div className="err">令牌被拒绝，请检查后重试。</div>}
        <input
          type="password"
          value={token}
          autoComplete="off"
          placeholder="AUTH_TOKEN"
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="submit">连接</button>
      </form>
    </div>
  );
}

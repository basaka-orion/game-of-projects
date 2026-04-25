import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../lib/motion-lite';
import { useAuthStore } from '../store/auth';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp, error, loading, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let ok = false;
    if (mode === 'login') {
      ok = await signIn(email, password);
    } else {
      ok = await signUp(email, password, name);
    }
    if (ok) navigate('/');
  };

  const toggleMode = () => {
    clearError();
    setMode(m => m === 'login' ? 'register' : 'login');
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0c29 50%, #1a1a2e 100%)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          width: '100%', maxWidth: 420,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 24, padding: '48px 36px', position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Top glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #7C4DFF 0%, #E040FB 50%, #64FFDA 100%)',
        }} />

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(124,77,255,0.15), rgba(100,255,218,0.1))',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, marginBottom: 16,
          }}>
            🔮
          </div>
          <h1 style={{
            fontSize: 24, fontWeight: 700, marginBottom: 6,
            fontFamily: 'var(--font-serif)',
            background: 'linear-gradient(135deg, #BB86FC, #64FFDA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {mode === 'login' ? '欢迎回来' : '创建账户'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {mode === 'login' ? '登录以同步你的画像数据' : '注册以保存你的多维画像'}
          </p>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                fontSize: 12, background: 'rgba(255,107,107,0.08)',
                color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.15)',
              }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              <label style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, display: 'block' }}>
                昵称
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="你的名字"
                required
                style={inputStyle}
              />
            </motion.div>
          )}

          <label style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, display: 'block' }}>
            邮箱
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={inputStyle}
          />

          <label style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6, display: 'block', marginTop: 16 }}>
            密码
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="至少 6 位"
            required
            minLength={6}
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 14,
              fontSize: 15, fontWeight: 600, marginTop: 24,
              background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
              color: '#fff', border: 'none', cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s',
            }}
          >
            {loading ? '处理中…' : mode === 'login' ? '登 录' : '注 册'}
          </button>
        </form>

        {/* Toggle */}
        <p style={{ textAlign: 'center', fontSize: 13, marginTop: 24, color: 'var(--text-tertiary)' }}>
          {mode === 'login' ? '还没有账户？' : '已有账户？'}
          <button
            onClick={toggleMode}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#BB86FC', fontSize: 13, marginLeft: 4,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>


      </motion.div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12,
  fontSize: 14, background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)',
  outline: 'none', marginBottom: 4, boxSizing: 'border-box',
};

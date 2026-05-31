'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Handle #access_token fragment from Google OAuth redirect (Netlify/non-Vercel hosting)
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Remove the hash from the URL to clean it up
        window.history.replaceState(null, '', window.location.pathname);

        // Set the session manually using the tokens from the hash
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data: { session }, error }) => {
            if (!error && session?.user?.email) {
              checkAdminGoogleAuth(session.user.email);
            }
          });
        return;
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) checkAdminGoogleAuth(session.user.email);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email) {
        checkAdminGoogleAuth(session.user.email);
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  async function checkAdminGoogleAuth(userEmail: string) {
    setLoading(true);
    try {
      // Use the server API to authenticate Google login and get JWT
      const res = await fetch('/api/admin/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_session', JSON.stringify(data.admin));
        router.push('/admin');
      } else {
        // Fallback: check directly if Google auth API not ready yet
        const { data: admin } = await supabase.from('admins').select('*').eq('email', userEmail).single();
        if (admin && admin.status === 'active') {
          // Generate token from manual login API as fallback
          localStorage.setItem('admin_session', JSON.stringify({
            id: admin.id, name: admin.name, email: admin.email, role: admin.role, status: admin.status
          }));
          router.push('/admin');
        } else {
          setError('Akun Google (' + userEmail + ') tidak terdaftar sebagai Admin yang aktif.');
          await supabase.auth.signOut();
          setLoading(false);
        }
      }
    } catch {
      // Fallback for Google auth
      const { data: admin } = await supabase.from('admins').select('*').eq('email', userEmail).single();
      if (admin && admin.status === 'active') {
        localStorage.setItem('admin_session', JSON.stringify({
          id: admin.id, name: admin.name, email: admin.email, role: admin.role, status: admin.status
        }));
        router.push('/admin');
      } else {
        setError('Akun Google (' + userEmail + ') tidak terdaftar sebagai Admin yang aktif.');
        await supabase.auth.signOut();
        setLoading(false);
      }
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login gagal');
        setLoading(false);
        return;
      }

      // Store JWT token + admin session
      if (data.token) {
        localStorage.setItem('admin_token', data.token);
      }
      localStorage.setItem('admin_session', JSON.stringify(data.admin));
      router.push('/admin');
    } catch {
      setError('Terjadi kesalahan koneksi');
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/admin/login',
      },
    });
    if (error) {
      setError('Error: ' + error.message);
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>pastipremium.my.id</h1>
        <p className="subtitle">Admin Dashboard</p>

        {error && <div className="login-error">{error}</div>}

        <button 
          type="button" 
          className="btn btn-primary btn-lg" 
          style={{ width: '100%', justifyContent: 'center', backgroundColor: '#fff', color: '#000', border: '1px solid #ddd', marginBottom: '24px' }} 
          onClick={handleGoogleLogin} 
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', marginRight: '8px' }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loading ? <span className="loading-spinner" style={{ borderColor: '#000', borderTopColor: 'transparent' }} /> : 'Login Admin via Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
          <span style={{ margin: '0 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Atau manual password</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-primary)' }} />
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@trustary.store"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary btn-lg" 
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? <span className="loading-spinner" /> : 'Masuk Manual'}
          </button>
        </form>
      </div>
    </div>
  );
}

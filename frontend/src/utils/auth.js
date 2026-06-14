const TOKEN_KEY = 'bank-auth-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = t => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export function decodeToken(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1]));
    if (!p.sub || !p.email) return null;
    if (p.exp && Date.now() / 1000 > p.exp) return null;
    return { id: p.sub, email: p.email, name: p.name || p.email, avatar: p.avatar || null };
  } catch { return null; }
}

export const getCurrentUser = () => { const t = getToken(); return t ? decodeToken(t) : null; };
export const loginWithGoogle = () => { window.location.href = '/api/auth/google'; };
export const logout = () => { clearToken(); window.location.reload(); };

export function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('auth_token');
  const error = params.get('auth_error');
  if (token) { setToken(token); window.history.replaceState({}, '', window.location.pathname); return token; }
  if (error) { console.error('OAuth error:', error); window.history.replaceState({}, '', window.location.pathname); }
  return null;
}

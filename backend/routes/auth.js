const router = require('express').Router();
const jwt    = require('jsonwebtoken');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;
const FRONTEND_URL         = process.env.FRONTEND_URL || 'https://bank.pickel.me';
const JWT_SECRET           = process.env.JWT_SECRET    || 'pick-a-bank-secret-change-in-prod';

// GET /api/auth/google — redirect to Google consent screen
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — exchange code → JWT → redirect to frontend
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}?auth_error=${error || 'no_code'}`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error('[auth] token exchange failed:', err);
      return res.redirect(`${FRONTEND_URL}?auth_error=token_exchange`);
    }

    const tokens = await tokenRes.json();

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error('Failed to fetch user profile');
    const profile = await profileRes.json();

    // Upsert user in DB
    const pool = req.app.locals.pool;
    await pool.query(
      `INSERT INTO users (id, email, name, avatar)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email=$2, name=$3, avatar=$4`,
      [`google:${profile.sub}`, profile.email, profile.name || profile.email, profile.picture || null]
    );

    const token = jwt.sign(
      { sub: `google:${profile.sub}`, email: profile.email, name: profile.name || profile.email, avatar: profile.picture || null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`${FRONTEND_URL}?auth_token=${token}`);
  } catch (err) {
    console.error('[auth] callback error:', err.message);
    res.redirect(`${FRONTEND_URL}?auth_error=server_error`);
  }
});

// GET /api/auth/me — return current user from JWT
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ id: payload.sub, email: payload.email, name: payload.name, avatar: payload.avatar });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;

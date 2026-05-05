import express from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { redis } from './redis.js';
import {
  audit,
  createAdminStore,
  createWifiSession,
  findStore,
  getAdminDashboard,
  getAdminPhoneDetails,
  getAdminStore,
  getAdminStores,
  markAuthorized,
  markOtpValidated,
  updateAdminStore,
  updateRegistration
} from './db.js';
import { normalizeBrazilPhone } from './phone.js';
import { createOtp, validateOtp } from './otp.js';
import { sendOtpWebhook, sendPostLoginWebhook } from './n8n.js';
import { authorizeGuest } from './unifi.js';
import { doneView, googleReviewView, lgpdView, otpView } from './views.js';
import { adminDashboardView, adminPhoneView, adminSessionsView, adminStoreFormView, adminStoresView } from './adminViews.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '128kb' }));
app.use('/public', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use(session({
  store: new RedisStore({ client: redis, prefix: 'sess:' }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000
  }
}));

function requireSession(req, res, next) {
  if (!req.session?.wifiSessionId) return res.redirect('/portal');
  next();
}

function requireAdmin(req, res, next) {
  if (!config.admin.username || !config.admin.password) {
    return res.status(503).send('Admin portal is not configured.');
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return requestAdminAuth(res);

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (username !== config.admin.username || password !== config.admin.password) {
    return requestAdminAuth(res);
  }
  next();
}

function requestAdminAuth(res) {
  res.set('WWW-Authenticate', 'Basic realm="Hotspot Soldamaq"');
  return res.status(401).send('Authentication required.');
}

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/', (req, res) => res.redirect(`/portal${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));

app.get('/admin', requireAdmin, async (_req, res, next) => {
  try {
    const data = await getAdminDashboard();
    res.send(adminDashboardView({ data }));
  } catch (error) {
    next(error);
  }
});

app.get('/admin/sessions', requireAdmin, async (_req, res, next) => {
  try {
    const data = await getAdminDashboard();
    res.send(adminSessionsView({ sessions: data.recentSessions }));
  } catch (error) {
    next(error);
  }
});

app.get('/admin/stores', requireAdmin, async (_req, res, next) => {
  try {
    const stores = await getAdminStores();
    res.send(adminStoresView({ stores }));
  } catch (error) {
    next(error);
  }
});

app.get('/admin/stores/new', requireAdmin, (_req, res) => {
  res.send(adminStoreFormView({
    title: 'Nova loja',
    action: '/admin/stores'
  }));
});

app.post('/admin/stores', requireAdmin, async (req, res, next) => {
  try {
    await createAdminStore(req.body);
    res.redirect('/admin/stores');
  } catch (error) {
    if (error.status === 400 || error.code === '23505') {
      const message = error.code === '23505' ? 'Codigo ou site UniFi ja cadastrado.' : error.message;
      return res.status(400).send(adminStoreFormView({
        title: 'Nova loja',
        action: '/admin/stores',
        store: req.body,
        error: message
      }));
    }
    next(error);
  }
});

app.get('/admin/stores/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const store = await getAdminStore(req.params.id);
    if (!store) return res.status(404).send('Loja nao encontrada.');
    res.send(adminStoreFormView({
      title: 'Editar loja',
      action: `/admin/stores/${store.id}`,
      store
    }));
  } catch (error) {
    next(error);
  }
});

app.post('/admin/stores/:id', requireAdmin, async (req, res, next) => {
  try {
    const store = await updateAdminStore(req.params.id, req.body);
    if (!store) return res.status(404).send('Loja nao encontrada.');
    res.redirect('/admin/stores');
  } catch (error) {
    if (error.status === 400 || error.code === '23505') {
      const message = error.code === '23505' ? 'Codigo ou site UniFi ja cadastrado.' : error.message;
      return res.status(400).send(adminStoreFormView({
        title: 'Editar loja',
        action: `/admin/stores/${req.params.id}`,
        store: { ...req.body, id: req.params.id },
        error: message
      }));
    }
    next(error);
  }
});

app.get('/admin/phones/:telefone', requireAdmin, async (req, res, next) => {
  try {
    const telefone = String(req.params.telefone || '').replace(/\D/g, '');
    const data = await getAdminPhoneDetails(telefone);
    res.send(adminPhoneView({ ...data, telefone }));
  } catch (error) {
    next(error);
  }
});

app.get(['/portal', '/guest/s/:site'], async (req, res, next) => {
  try {
    const mac = String(req.query.mac || req.query.id || '').toLowerCase();
    const ap = String(req.query.ap || '').toLowerCase();
    const ssid = String(req.query.ssid || '');
    const site = String(req.query.site || req.params.site || config.unifi.defaultSite);

    if (!mac || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
      return res.status(400).send(lgpdView({ store: null, error: 'Parametro MAC ausente ou invalido.' }));
    }

    const store = await findStore({ site, ap });
    const sessionRow = await createWifiSession({
      storeId: store?.id || config.defaultStoreId,
      mac,
      ap,
      ssid,
      site
    });
    req.session.wifiSessionId = sessionRow.id;
    req.session.store = store;
    req.session.mac = mac;
    req.session.ap = ap;
    req.session.ssid = ssid;
    req.session.site = site;
    await audit({ event: 'portal_entry', sessionId: sessionRow.id, mac, payload: { ap, ssid, site } });
    res.send(lgpdView({ store }));
  } catch (error) {
    next(error);
  }
});

app.post('/register', requireSession, async (req, res, next) => {
  try {
    const nome = String(req.body.nome || '').trim().replace(/\s+/g, ' ');
    const telefone = normalizeBrazilPhone(req.body.telefone);
    const lgpdAccepted = req.body.lgpd === 'yes';

    if (!lgpdAccepted) return res.status(400).send(lgpdView({ store: req.session.store, error: 'Aceite a LGPD para continuar.' }));
    if (nome.length < 2) return res.status(400).send(lgpdView({ store: req.session.store, error: 'Informe seu nome.' }));
    if (!telefone) return res.status(400).send(lgpdView({ store: req.session.store, error: 'Informe um WhatsApp brasileiro valido.' }));

    req.session.nome = nome;
    req.session.telefone = telefone;
    await updateRegistration({ sessionId: req.session.wifiSessionId, nome, telefone, lgpdAccepted });
    await audit({ event: 'register', sessionId: req.session.wifiSessionId, telefone, mac: req.session.mac });
    return sendOtp(req, res, next);
  } catch (error) {
    next(error);
  }
});

async function sendOtp(req, res, next) {
  try {
    if (!req.session.telefone) return res.redirect('/portal');
    const otp = await createOtp({ telefone: req.session.telefone, sessionId: req.session.wifiSessionId });
    await sendOtpWebhook({
      nome: req.session.nome,
      telefone: req.session.telefone,
      mac: req.session.mac,
      ap: req.session.ap,
      ssid: req.session.ssid,
      site: req.session.site,
      store_id: req.session.store?.id,
      codigo: otp.codigo,
      expiracao: otp.expiresAt.toISOString(),
      evento: 'send_otp'
    });
    await audit({ event: 'send_otp', sessionId: req.session.wifiSessionId, telefone: req.session.telefone, mac: req.session.mac });
    res.send(otpView({ telefone: req.session.telefone, sent: true }));
  } catch (error) {
    if (error.status === 429) return res.status(429).send(otpView({ telefone: req.session.telefone, error: error.message }));
    next(error);
  }
}

app.get('/send-otp', requireSession, sendOtp);
app.post('/send-otp', requireSession, sendOtp);

app.get('/otp', requireSession, (req, res) => {
  res.send(otpView({ telefone: req.session.telefone }));
});

app.post('/validate-otp', requireSession, async (req, res, next) => {
  try {
    const codigo = String(req.body.codigo || '').trim();
    const result = await validateOtp({ telefone: req.session.telefone, sessionId: req.session.wifiSessionId, codigo });
    if (!result.ok) return res.status(400).send(otpView({ telefone: req.session.telefone, error: result.reason }));

    await markOtpValidated({ sessionId: req.session.wifiSessionId, telefone: req.session.telefone, codigo });
    req.session.otpValidated = true;
    await audit({ event: 'validate_otp', sessionId: req.session.wifiSessionId, telefone: req.session.telefone, mac: req.session.mac });
    res.send(googleReviewView({ store: req.session.store }));
  } catch (error) {
    next(error);
  }
});

app.post('/authorize', requireSession, async (req, res, next) => {
  try {
    if (!req.session.otpValidated) return res.status(403).send(otpView({ telefone: req.session.telefone, error: 'Valide o codigo antes de liberar.' }));

    await authorizeGuest({ site: req.session.site, mac: req.session.mac, minutes: config.guestMinutes });
    await markAuthorized({ sessionId: req.session.wifiSessionId });
    await audit({ event: 'authorize', sessionId: req.session.wifiSessionId, telefone: req.session.telefone, mac: req.session.mac });
    await sendPostLoginWebhook({
      nome: req.session.nome,
      telefone: req.session.telefone,
      mac: req.session.mac,
      ap: req.session.ap,
      site: req.session.site,
      store_id: req.session.store?.id,
      google_place_id: req.session.store?.google_place_id,
      google_review_url: req.session.store?.google_review_url,
      evento: 'post_login'
    });
    res.send(doneView({ store: req.session.store }));
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  logger.error({ err: error, path: req.path }, 'request failed');
  res.status(error.status || 500).send(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"><main class="shell"><section class="panel"><h1>Ops</h1><p class="error">Nao foi possivel concluir agora. Tente novamente em instantes.</p></section></main></html>`);
});

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'hotspot portal listening');
});

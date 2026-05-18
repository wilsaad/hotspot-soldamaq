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
  findAuthorizedWifiSessionForLease,
  findRecentMikrotikLease,
  findValidationToken,
  findStore,
  getAdminDashboard,
  getAdminPhoneDetails,
  getAdminStore,
  getAdminStores,
  markAuthorized,
  markOtpValidated,
  updateAdminStore,
  updateRegistration,
  upsertMikrotikLease
} from './db.js';
import { normalizeBrazilPhone } from './phone.js';
import { createValidationLinkToken } from './otp.js';
import { sendOtpWebhook, sendPostLoginWebhook } from './n8n.js';
import { authorizeGuest } from './unifi.js';
import { authorizeMikrotikClient } from './mikrotik.js';
import { doneView, lgpdView, otpView, temporaryAccessView, validationConfirmView, validationErrorView } from './views.js';
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
app.use((req, res, next) => {
  if (!req.path.startsWith('/public/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }
  next();
});
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

app.get('/captive-portal/api', async (req, res, next) => {
  try {
    const authorizedSession = await findAuthorizedWifiSessionForLease({
      site: null,
      publicIp: requestPublicIp(req)
    });

    res.type('application/captive+json');
    res.json(authorizedSession ? { captive: false } : {
      captive: true,
      'user-portal-url': config.captivePortalUrl
    });
  } catch (error) {
    next(error);
  }
});

function requestPublicIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.ip || '').replace(/^::ffff:/, '');
}

function isValidMac(mac) {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac);
}

app.all('/mikrotik/lease', async (req, res, next) => {
  try {
    const params = { ...req.query, ...req.body };
    const secret = String(params.secret || req.headers['x-hotspot-secret'] || '');
    if (!config.mikrotikWebhookSecret || secret !== config.mikrotikWebhookSecret) {
      return res.status(403).json({ ok: false });
    }

    const mac = String(params.mac || '').toLowerCase();
    const clientIp = String(params.ip || params.client_ip || '');
    const site = String(params.site || config.unifi.defaultSite);
    const ssid = String(params.ssid || '');
    const status = String(params.status || 'bound');

    if (!isValidMac(mac) || !clientIp) return res.status(400).json({ ok: false });

    const row = await upsertMikrotikLease({
      site,
      mac,
      clientIp,
      ssid,
      publicIp: requestPublicIp(req),
      status
    });
    res.json({ ok: true, id: row.id });
  } catch (error) {
    next(error);
  }
});

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

app.all(['/portal', '/guest/s/:site', '/mikrotik/portal'], async (req, res, next) => {
  try {
    const hotspotParams = { ...req.query, ...req.body };
    let mac = String(hotspotParams.mac || hotspotParams.id || '').toLowerCase();
    const ap = String(hotspotParams.ap || '').toLowerCase();
    const ssid = String(hotspotParams.ssid || '');
    const site = String(hotspotParams.site || req.params.site || config.unifi.defaultSite);
    const hotspotLoginUrl = String(hotspotParams['link-login-only'] || hotspotParams.link_login_only || '');
    const hotspotOrigUrl = String(hotspotParams['link-orig'] || hotspotParams.link_orig || '');
    let clientIp = String(hotspotParams.ip || '');
    let leaseMatched = false;

    if (!isValidMac(mac) && hotspotParams.source === 'dhcp114') {
      const lease = await findRecentMikrotikLease({ site, publicIp: requestPublicIp(req) });
      if (lease) {
        mac = lease.mac;
        clientIp = clientIp || lease.client_ip;
        leaseMatched = true;
      }
    }

    if (!isValidMac(mac)) {
      return res.status(400).send(lgpdView({ store: null, error: 'Nao localizamos sua conexao WiFi. Reconecte na rede e tente novamente.' }));
    }

    const store = await findStore({ site, ap });
    const sessionRow = await createWifiSession({
      storeId: store?.id || config.defaultStoreId,
      mac,
      ap,
      ssid,
      site,
      hotspotLoginUrl,
      hotspotOrigUrl,
      clientIp
    });
    req.session.wifiSessionId = sessionRow.id;
    req.session.store = store;
    req.session.mac = mac;
    req.session.ap = ap;
    req.session.ssid = ssid;
    req.session.site = site;
    req.session.hotspotLoginUrl = hotspotLoginUrl;
    req.session.hotspotOrigUrl = hotspotOrigUrl;
    req.session.clientIp = clientIp;
    await audit({ event: 'portal_entry', sessionId: sessionRow.id, mac, payload: { ap, ssid, site, backend: store?.auth_backend || 'unifi', lease_matched: leaseMatched } });
    let entryAuthorized = false;
    if (store?.auto_authorize_on_entry) {
      if (store.auth_backend === 'mikrotik') {
        try {
          if (clientIp) {
            const entryAuthorizeStartedAt = Date.now();
            const mikrotikAuthorization = await authorizeMikrotikClient({
              mac,
              clientIp,
              minutes: store.entry_guest_minutes || config.tempGuestMinutes,
              kind: 'entry'
            });
            const entryAuthorizeDurationMs = Date.now() - entryAuthorizeStartedAt;
            await markAuthorized({ sessionId: sessionRow.id });
            await audit({
              event: 'temporary_authorize',
              sessionId: sessionRow.id,
              mac,
              payload: {
                ...mikrotikAuthorization,
                duration_ms: entryAuthorizeDurationMs
              }
            });
            entryAuthorized = true;
          } else {
            entryAuthorized = Boolean(hotspotLoginUrl);
            await audit({
              event: 'entry_temporary_login_dispatched',
              sessionId: sessionRow.id,
              mac,
              payload: {
                minutes: store.entry_guest_minutes || config.tempGuestMinutes,
                backend: 'mikrotik',
                has_login_url: Boolean(hotspotLoginUrl)
              }
            });
          }
          req.session.entryAuthorized = entryAuthorized;
        } catch (entryAuthorizeError) {
          logger.warn({ err: entryAuthorizeError, sessionId: sessionRow.id }, 'MikroTik entry authorization failed');
          await audit({
            event: 'entry_temporary_authorize_failed',
            sessionId: sessionRow.id,
            mac,
            payload: { message: entryAuthorizeError.message, backend: 'mikrotik' }
          });
        }
      } else try {
        const entryAuthorizeStartedAt = Date.now();
        const entryAuthorization = await authorizeGuest({
          site,
          mac,
          minutes: store.entry_guest_minutes || config.tempGuestMinutes
        });
        const entryAuthorizeDurationMs = Date.now() - entryAuthorizeStartedAt;
        await markAuthorized({ sessionId: sessionRow.id });
        await audit({
          event: 'entry_temporary_authorize',
          sessionId: sessionRow.id,
          mac,
          payload: {
            minutes: store.entry_guest_minutes || config.tempGuestMinutes,
            duration_ms: entryAuthorizeDurationMs,
            unifi: summarizeUnifiAuthorization(entryAuthorization)
          }
        });
        req.session.entryAuthorized = true;
        entryAuthorized = true;
      } catch (entryAuthorizeError) {
        logger.warn({ err: entryAuthorizeError, sessionId: sessionRow.id }, 'entry authorization failed');
        await audit({
          event: 'entry_temporary_authorize_failed',
          sessionId: sessionRow.id,
          mac,
          payload: { message: entryAuthorizeError.message }
        });
      }
    }
    res.send(lgpdView({
      store,
      entryAuthorized,
      mikrotikLogin: entryAuthorized ? buildMikrotikLogin(req.session, 'entry') : null
    }));
  } catch (error) {
    next(error);
  }
});

app.post('/register', requireSession, async (req, res, next) => {
  try {
    const nome = String(req.body.nome || '').trim().replace(/\s+/g, ' ');
    const telefone = normalizeBrazilPhone(req.body.telefone);
    const lgpdAccepted = req.body.lgpd === 'yes';

    if (!lgpdAccepted) return res.status(400).send(lgpdView({ store: req.session.store, entryAuthorized: req.session.entryAuthorized, mikrotikLogin: req.session.entryAuthorized ? buildMikrotikLogin(req.session, 'entry') : null, error: 'Aceite a LGPD para continuar.' }));
    if (nome.length < 2) return res.status(400).send(lgpdView({ store: req.session.store, entryAuthorized: req.session.entryAuthorized, mikrotikLogin: req.session.entryAuthorized ? buildMikrotikLogin(req.session, 'entry') : null, error: 'Informe seu nome.' }));
    if (!telefone) return res.status(400).send(lgpdView({ store: req.session.store, entryAuthorized: req.session.entryAuthorized, mikrotikLogin: req.session.entryAuthorized ? buildMikrotikLogin(req.session, 'entry') : null, error: 'Informe um WhatsApp brasileiro valido.' }));

    req.session.nome = nome;
    req.session.telefone = telefone;
    await updateRegistration({ sessionId: req.session.wifiSessionId, nome, telefone, lgpdAccepted });
    await audit({ event: 'register', sessionId: req.session.wifiSessionId, telefone, mac: req.session.mac });
    return sendValidationLink(req, res, next);
  } catch (error) {
    next(error);
  }
});

function publicUrl(req, path) {
  return `${req.protocol}://${req.get('host')}${path}`;
}

function summarizeUnifiAuthorization(response) {
  const guest = Array.isArray(response?.data) ? response.data[0] : null;
  if (!guest) return { rc: response?.meta?.rc };
  return {
    rc: response?.meta?.rc,
    ap_mac: guest.ap_mac,
    ip: guest.ip,
    start: guest.start,
    end: guest.end,
    authorized_by: guest.authorized_by
  };
}

function buildMikrotikLogin(session, kind) {
  if (!session.hotspotLoginUrl) return null;
  const username = kind === 'extended' ? config.mikrotik.extendedUsername : config.mikrotik.entryUsername;
  const password = kind === 'extended' ? config.mikrotik.extendedPassword : config.mikrotik.entryPassword;
  if (!username || !password) return null;
  return {
    url: session.hotspotLoginUrl,
    username,
    password,
    dst: session.hotspotOrigUrl || 'http://neverssl.com/'
  };
}

async function sendValidationLink(req, res, next) {
  try {
    if (!req.session.telefone) return res.redirect('/portal');
    const token = await createValidationLinkToken({ telefone: req.session.telefone, sessionId: req.session.wifiSessionId });
    const validationPath = `/whatsapp/validate/${encodeURIComponent(token.token)}`;
    const validationUrl = publicUrl(req, validationPath);

    if (!req.session.entryAuthorized && req.session.store?.auth_backend !== 'mikrotik') {
      const tempAuthorizeStartedAt = Date.now();
      const tempAuthorization = await authorizeGuest({ site: req.session.site, mac: req.session.mac, minutes: config.tempGuestMinutes });
      const tempAuthorizeDurationMs = Date.now() - tempAuthorizeStartedAt;
      await markAuthorized({ sessionId: req.session.wifiSessionId });
      await audit({
        event: 'temporary_authorize',
        sessionId: req.session.wifiSessionId,
        telefone: req.session.telefone,
        mac: req.session.mac,
        payload: {
          minutes: config.tempGuestMinutes,
          duration_ms: tempAuthorizeDurationMs,
          unifi: summarizeUnifiAuthorization(tempAuthorization)
        }
      });
    }

    const mensagem = `Soldamaq: sua internet foi liberada por ${config.tempGuestMinutes} minutos. Para estender por mais ${config.extendedGuestMinutes} minutos, valide seu WhatsApp neste link: ${validationUrl}`;
    const webhookPayload = {
      nome: req.session.nome,
      telefone: req.session.telefone,
      mac: req.session.mac,
      ap: req.session.ap,
      ssid: req.session.ssid,
      site: req.session.site,
      store_id: req.session.store?.id,
      codigo: validationUrl,
      validation_token: token.token,
      validation_url: validationUrl,
      mensagem,
      expiracao: token.expiresAt.toISOString(),
      evento: 'send_validation_link'
    };

    try {
      await sendOtpWebhook(webhookPayload);
      await audit({
        event: 'send_validation_link',
        sessionId: req.session.wifiSessionId,
        telefone: req.session.telefone,
        mac: req.session.mac,
        payload: { expiresAt: token.expiresAt.toISOString() }
      });
    } catch (webhookError) {
      logger.warn({ err: webhookError, sessionId: req.session.wifiSessionId }, 'validation link webhook failed after temporary authorization');
      await audit({
        event: 'send_validation_link_failed',
        sessionId: req.session.wifiSessionId,
        telefone: req.session.telefone,
        mac: req.session.mac,
        payload: { message: webhookError.message, expiresAt: token.expiresAt.toISOString() }
      });
    }

    res.send(temporaryAccessView({
      telefone: req.session.telefone,
      minutes: config.tempGuestMinutes,
      extendedMinutes: config.extendedGuestMinutes,
      mikrotikLogin: req.session.store?.auth_backend === 'mikrotik' && !req.session.entryAuthorized
        ? buildMikrotikLogin(req.session, 'entry')
        : null
    }));
  } catch (error) {
    if (error.status === 429) return res.status(429).send(otpView({ telefone: req.session.telefone, error: error.message }));
    next(error);
  }
}

app.get('/send-otp', requireSession, sendValidationLink);
app.post('/send-otp', requireSession, sendValidationLink);

app.get('/otp', requireSession, (req, res) => {
  res.send(otpView({ telefone: req.session.telefone }));
});

app.post('/validate-otp', requireSession, async (req, res, next) => {
  try {
    res.status(410).send(otpView({
      telefone: req.session.telefone,
      error: 'Use o link enviado no WhatsApp para validar seu acesso.'
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/whatsapp/validate/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    const row = await findValidationToken(token);
    if (!row) return res.status(400).send(validationErrorView({ error: 'Link expirado ou ja utilizado.' }));

    res.send(validationConfirmView({
      token,
      telefone: row.telefone,
      extendedMinutes: config.extendedGuestMinutes
    }));
  } catch (error) {
    next(error);
  }
});

app.post('/whatsapp/validate/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    const row = await findValidationToken(token);
    if (!row) return res.status(400).send(validationErrorView({ error: 'Link expirado ou ja utilizado.' }));

    let authorizationPayload;
    let mikrotikLogin = null;
    if (row.auth_backend === 'mikrotik') {
      if (row.client_ip) {
        const mikrotikAuthorization = await authorizeMikrotikClient({
          mac: row.mac,
          clientIp: row.client_ip,
          minutes: config.extendedGuestMinutes,
          kind: 'extended'
        });
        authorizationPayload = {
          ...mikrotikAuthorization,
          mode: 'ssh'
        };
      } else {
        mikrotikLogin = buildMikrotikLogin({
          hotspotLoginUrl: row.hotspot_login_url,
          hotspotOrigUrl: row.hotspot_orig_url
        }, 'extended');
        authorizationPayload = {
          minutes: config.extendedGuestMinutes,
          backend: 'mikrotik',
          mode: 'hotspot-login',
          login_dispatched: Boolean(mikrotikLogin)
        };
      }
    } else {
      const extendedAuthorizeStartedAt = Date.now();
      const extendedAuthorization = await authorizeGuest({ site: row.unifi_site, mac: row.mac, minutes: config.extendedGuestMinutes });
      const extendedAuthorizeDurationMs = Date.now() - extendedAuthorizeStartedAt;
      authorizationPayload = {
        minutes: config.extendedGuestMinutes,
        duration_ms: extendedAuthorizeDurationMs,
        unifi: summarizeUnifiAuthorization(extendedAuthorization)
      };
    }
    await markOtpValidated({ sessionId: row.wifi_session_id, telefone: row.telefone, codigo: token });
    await markAuthorized({ sessionId: row.wifi_session_id });
    await audit({
      event: 'validate_whatsapp_link',
      sessionId: row.wifi_session_id,
      telefone: row.telefone,
      mac: row.mac,
      payload: authorizationPayload
    });

    const store = {
      id: row.store_id,
      name: row.store_name,
      google_place_id: row.google_place_id,
      google_review_url: row.google_review_url
    };

    await sendPostLoginWebhook({
      nome: row.nome,
      telefone: row.telefone,
      mac: row.mac,
      ap: row.ap,
      site: row.unifi_site,
      store_id: row.store_id,
      google_place_id: row.google_place_id,
      google_review_url: row.google_review_url,
      evento: 'post_login'
    });

    res.send(doneView({ store, mikrotikLogin }));
  } catch (error) {
    next(error);
  }
});

app.post('/authorize', requireSession, async (req, res, next) => {
  try {
    if (!req.session.otpValidated) return res.status(403).send(otpView({ telefone: req.session.telefone, error: 'Use o link enviado no WhatsApp para validar seu acesso.' }));

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

import https from 'node:https';
import axios from 'axios';
import { config } from './config.js';

function axiosClient() {
  return axios.create({
    baseURL: config.unifi.baseUrl,
    timeout: 15000,
    validateStatus: status => status >= 200 && status < 500,
    httpsAgent: new https.Agent({ rejectUnauthorized: config.unifi.verifyTls })
  });
}

async function login(client, loginPath) {
  const response = await client.post(loginPath, {
    username: config.unifi.username,
    password: config.unifi.password
  });

  if (response.status >= 400) {
    throw new Error(`UniFi login failed at ${loginPath}: HTTP ${response.status}`);
  }

  const cookies = response.headers['set-cookie'];
  const csrf = response.headers['x-csrf-token'] || response.headers['csrf-token'];
  return {
    cookie: Array.isArray(cookies) ? cookies.map(cookie => cookie.split(';')[0]).join('; ') : '',
    csrf
  };
}

async function authorizeWithMode({ site, mac, minutes, mode }) {
  if (!config.unifi.baseUrl || !config.unifi.username || !config.unifi.password) {
    throw new Error('UniFi credentials are not configured.');
  }

  const client = axiosClient();
  const loginPath = mode === 'proxy' ? '/api/auth/login' : '/api/login';
  const auth = await login(client, loginPath);
  const path = mode === 'proxy'
    ? `/proxy/network/api/s/${encodeURIComponent(site)}/cmd/stamgr`
    : `/api/s/${encodeURIComponent(site)}/cmd/stamgr`;

  const response = await client.post(
    path,
    {
      cmd: 'authorize-guest',
      mac,
      minutes
    },
    {
      headers: {
        Cookie: auth.cookie,
        ...(auth.csrf ? { 'X-CSRF-Token': auth.csrf } : {})
      }
    }
  );

  if (response.status >= 400 || response.data?.meta?.rc === 'error') {
    throw new Error(`UniFi authorize-guest failed: HTTP ${response.status} ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

export async function authorizeGuest({ site, mac, minutes = config.guestMinutes }) {
  const selectedSite = site || config.unifi.defaultSite;
  const mode = config.unifi.apiMode;

  if (mode === 'proxy') return authorizeWithMode({ site: selectedSite, mac, minutes, mode: 'proxy' });
  if (mode === 'legacy') return authorizeWithMode({ site: selectedSite, mac, minutes, mode: 'legacy' });

  try {
    return await authorizeWithMode({ site: selectedSite, mac, minutes, mode: 'proxy' });
  } catch (proxyError) {
    try {
      return await authorizeWithMode({ site: selectedSite, mac, minutes, mode: 'legacy' });
    } catch (legacyError) {
      legacyError.message = `${legacyError.message}; proxy attempt also failed: ${proxyError.message}`;
      throw legacyError;
    }
  }
}

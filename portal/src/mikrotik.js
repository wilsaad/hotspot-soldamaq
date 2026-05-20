import fs from 'node:fs/promises';
import { Client } from 'ssh2';
import { config } from './config.js';

function quote(value) {
  return `"${String(value || '').replace(/(["\\])/g, '\\$1')}"`;
}

function bindingComment({ mac, kind }) {
  return `SOLDAMAQ-${kind.toUpperCase()} ${String(mac || '').toUpperCase()}`;
}

function schedulerName({ clientIp, kind }) {
  return `soldamaq-${kind}-${String(clientIp || '').replace(/[^0-9a-z]/gi, '-')}`;
}

function schedulerPattern(clientIp) {
  return String(clientIp || '').replace(/\./g, '[.-]');
}

function durationInterval(minutes) {
  const value = Math.max(1, Number.parseInt(minutes || '1', 10));
  if (value % 60 === 0) return `${value / 60}h`;
  return `${value}m`;
}

async function privateKey() {
  if (!config.mikrotik.sshPrivateKeyPath) return '';
  return fs.readFile(config.mikrotik.sshPrivateKeyPath, 'utf8');
}

function endpointForSite(site) {
  const rawEndpoint = config.mikrotik.sshHostsBySite?.[site] || config.mikrotik.sshHost || '';
  const [host, port] = String(rawEndpoint).split(':');
  return {
    host,
    port: Number.parseInt(port || String(config.mikrotik.sshPort), 10)
  };
}

async function runCommand(command, { site } = {}) {
  const key = await privateKey();
  const endpoint = endpointForSite(site);
  if (!endpoint.host || !config.mikrotik.sshUsername || !key) {
    throw new Error('MikroTik SSH is not configured');
  }

  return new Promise((resolve, reject) => {
    const client = new Client();
    let stdout = '';
    let stderr = '';

    client
      .on('ready', () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }

          stream
            .on('close', (code) => {
              client.end();
              if (code === 0) resolve({ stdout, stderr });
              else reject(new Error(stderr || stdout || `MikroTik SSH command failed with code ${code}`));
            })
            .on('data', (data) => {
              stdout += data.toString();
            })
            .stderr.on('data', (data) => {
              stderr += data.toString();
            });
        });
      })
      .on('error', reject)
      .connect({
        host: endpoint.host,
        port: endpoint.port,
        username: config.mikrotik.sshUsername,
        privateKey: key,
        readyTimeout: config.mikrotik.sshReadyTimeout,
        algorithms: {
          serverHostKey: ['rsa-sha2-256', 'ssh-rsa'],
          sign: ['ssh-rsa', 'rsa-sha2-256']
        }
      });
  });
}

export async function authorizeMikrotikClient({ mac, clientIp, minutes, kind = 'extended', site }) {
  if (!mac || !clientIp) throw new Error('MikroTik authorization requires mac and clientIp');

  const comment = bindingComment({ mac, kind });
  const scheduler = schedulerName({ clientIp, kind });
  const existingSchedulerPattern = schedulerPattern(clientIp);
  const interval = durationInterval(minutes);
  const removeCommand = [
    `/ip hotspot ip-binding remove [find comment=${quote(comment)}]`,
    `/ip hotspot active remove [find mac-address=${mac}]`,
    `/ip hotspot host remove [find mac-address=${mac}]`,
    `/ip firewall connection remove [find src-address~${quote(clientIp)}]`,
    `/ip firewall connection remove [find dst-address~${quote(clientIp)}]`,
    `/system scheduler remove [find name=${quote(scheduler)}]`
  ].join('; ');
  const command = [
    `/ip hotspot ip-binding remove [find comment=${quote(comment)}]`,
    `/ip hotspot ip-binding remove [find address=${clientIp}]`,
    `/ip hotspot ip-binding remove [find mac-address=${mac} address=${clientIp}]`,
    `/system scheduler remove [find name=${quote(scheduler)}]`,
    `/system scheduler remove [find name~${quote(existingSchedulerPattern)}]`,
    `/ip hotspot ip-binding add mac-address=${mac} address=${clientIp} type=bypassed comment=${quote(comment)}`,
    `/system scheduler add name=${quote(scheduler)} interval=${interval} on-event=${quote(removeCommand)}`
  ].join('; ');

  const result = await runCommand(command, { site });
  return {
    backend: 'mikrotik',
    site,
    mac,
    client_ip: clientIp,
    minutes,
    kind,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

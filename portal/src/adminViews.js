import { displayPhone } from './phone.js';
import { escapeHtml } from './views.js';

function adminLayout({ title, body }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/public/admin.css">
</head>
<body>
  <header class="topbar">
    <div>
      <img src="/public/images/soldamaq-logo-campaign.png" alt="Soldamaq">
      <span>Gestao do Hotspot</span>
    </div>
    <nav>
      <a href="/admin">Dashboard</a>
      <a href="/admin/stores">Lojas</a>
      <a href="/admin/sessions">Sessoes</a>
    </nav>
  </header>
  <main class="admin-shell">${body}</main>
</body>
</html>`;
}

export function adminDashboardView({ data }) {
  const summary = data.summary || {};
  return adminLayout({
    title: 'Gestao Hotspot',
    body: `<section class="hero">
        <div>
          <h1>Dados coletados no WiFi</h1>
          <p>Visao operacional das autenticacoes, telefones recorrentes e jornada dos clientes.</p>
        </div>
      </section>

      <section class="metrics">
        ${metric('Sessoes', summary.total_sessions)}
        ${metric('Telefones unicos', summary.unique_phones)}
        ${metric('Dispositivos unicos', summary.unique_devices)}
        ${metric('OTP validado', `${percent(summary.otp_validated, summary.total_sessions)}%`)}
        ${metric('Autorizados', `${percent(summary.authorized, summary.total_sessions)}%`)}
        ${metric('Ultimas 24h', summary.sessions_24h)}
      </section>

      <section class="grid two">
        <article class="panel">
          <div class="panel-head">
            <h2>Por loja</h2>
          </div>
          ${table({
            headers: ['Loja', 'Sessoes', 'Telefones', 'OTP', 'Autorizados', 'Ultimo acesso'],
            rows: data.byStore.map((row) => [
              row.store_name,
              row.sessions,
              row.unique_phones,
              row.otp_validated,
              row.authorized,
              formatDate(row.last_seen)
            ])
          })}
        </article>

        <article class="panel">
          <div class="panel-head">
            <h2>Telefones recorrentes</h2>
          </div>
          ${table({
            headers: ['Telefone', 'Nome', 'Visitas', 'Lojas', 'Media entre visitas'],
            rows: data.recurrentPhones.map((row) => [
              raw(phoneLink(row.telefone)),
              row.nome || '',
              row.visits,
              row.stores_visited,
              minutes(row.avg_minutes_between_visits)
            ])
          })}
        </article>
      </section>

      <section class="grid two">
        <article class="panel">
          <div class="panel-head">
            <h2>Sessoes recentes</h2>
            <a href="/admin/sessions">Ver todas</a>
          </div>
          ${sessionsTable(data.recentSessions.slice(0, 20))}
        </article>

        <article class="panel">
          <div class="panel-head">
            <h2>Maiores tempos ate liberar</h2>
          </div>
          ${table({
            headers: ['Cliente', 'Loja', 'MAC', 'Tempo', 'Data'],
            rows: data.slowFunnels.map((row) => [
              row.nome || displayPhone(row.telefone || ''),
              row.store_name,
              row.mac,
              seconds(row.seconds_to_authorize),
              formatDate(row.created_at)
            ])
          })}
        </article>
      </section>`
  });
}

export function adminSessionsView({ sessions }) {
  return adminLayout({
    title: 'Sessoes Hotspot',
    body: `<section class="hero compact">
        <div>
          <h1>Sessoes recentes</h1>
          <p>Ultimos acessos registrados no captive portal.</p>
        </div>
      </section>
      <article class="panel">${sessionsTable(sessions)}</article>`
  });
}

export function adminStoresView({ stores }) {
  return adminLayout({
    title: 'Lojas Soldamaq',
    body: `<section class="hero compact">
        <div>
          <h1>Lojas Soldamaq</h1>
          <p>Cadastro usado para identificar site UniFi, loja, link de avaliacao e dados de recorrencia.</p>
        </div>
        <a class="button" href="/admin/stores/new">Nova loja</a>
      </section>
      <article class="panel">
        ${table({
          headers: ['ID', 'Codigo', 'Loja', 'Site UniFi', 'Cidade', 'Telefone', 'Gerente', 'Entrada livre', 'Sessoes', 'Telefones', 'Review', 'Acoes'],
          rows: stores.map((row) => [
            row.id,
            row.code || '',
            row.name,
            row.unifi_site,
            `${row.city || ''}/${row.state || ''}`,
            row.phone || '',
            row.manager || '',
            row.auto_authorize_on_entry ? raw(`<span class="badge ok">${row.entry_guest_minutes} min</span>`) : raw('<span class="badge muted">Nao</span>'),
            row.sessions,
            row.unique_phones,
            row.google_review_url ? raw('<span class="badge ok">Configurado</span>') : raw('<span class="badge muted">Pendente</span>'),
            raw(`<a href="/admin/stores/${row.id}/edit">Editar</a>`)
          ])
        })}
      </article>`
  });
}

export function adminStoreFormView({ store = {}, action, title, error = '' }) {
  return adminLayout({
    title,
    body: `<section class="hero compact">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>Atualize os dados usados pelo portal, dashboard e redirecionamento de avaliacao.</p>
        </div>
      </section>
      <article class="panel">
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        <form method="post" action="${escapeHtml(action)}" class="admin-form">
          ${input('Codigo', 'code', store.code, 'Ex: 13MAIO')}
          ${input('Nome da loja', 'name', store.name, 'Soldamaq - Unidade', true)}
          ${input('Site UniFi', 'unifi_site', store.unifi_site, 'site-id-da-controladora', true)}
          ${input('Endereco', 'address', store.address, 'Rua, numero - bairro')}
          ${input('Cidade', 'city', store.city, 'Campo Grande')}
          ${input('Estado', 'state', store.state || 'MS', 'MS')}
          ${input('Telefone', 'phone', store.phone, '(67) 0000-0000')}
          ${input('Gerente', 'manager', store.manager, 'Nome do responsavel')}
          ${input('Google Place ID', 'google_place_id', store.google_place_id, 'Opcional')}
          ${input('URL de avaliacao Google', 'google_review_url', store.google_review_url, 'https://www.google.com/...')}
          <label class="check">
            <input type="checkbox" name="auto_authorize_on_entry" ${store.auto_authorize_on_entry ? 'checked' : ''}>
            <span>Liberar internet automaticamente na entrada</span>
          </label>
          ${input('Minutos liberados na entrada', 'entry_guest_minutes', store.entry_guest_minutes || 7, '7')}
          <label>AP aliases
            <textarea name="ap_aliases" rows="4" placeholder="Um AP por linha ou separados por virgula">${escapeHtml((store.ap_aliases || []).join('\n'))}</textarea>
          </label>
          <div class="form-actions">
            <a class="button secondary" href="/admin/stores">Cancelar</a>
            <button class="button" type="submit">Salvar loja</button>
          </div>
        </form>
      </article>`
  });
}

export function adminPhoneView({ profile, sessions, telefone }) {
  return adminLayout({
    title: 'Telefone Hotspot',
    body: `<section class="hero compact">
        <div>
          <h1>${escapeHtml(displayPhone(telefone))}</h1>
          <p>${escapeHtml(profile?.nome || 'Cliente identificado pelo telefone')}</p>
        </div>
      </section>

      <section class="metrics">
        ${metric('Visitas', profile?.visits || 0)}
        ${metric('Dispositivos', profile?.devices || 0)}
        ${metric('Lojas visitadas', profile?.stores_visited || 0)}
        ${metric('Primeiro acesso', formatDate(profile?.first_seen))}
        ${metric('Ultimo acesso', formatDate(profile?.last_seen))}
        ${metric('Media entre visitas', minutes(profile?.avg_minutes_between_visits))}
      </section>

      <article class="panel">
        <div class="panel-head">
          <h2>Historico de conexoes</h2>
        </div>
        ${table({
          headers: ['Data', 'Loja', 'Nome', 'MAC', 'AP', 'SSID', 'Desde anterior', 'Liberacao', 'Status'],
          rows: sessions.map((row) => [
            formatDate(row.created_at),
            row.store_name,
            row.nome || '',
            row.mac,
            row.ap || '',
            row.ssid || '',
            seconds(row.seconds_since_previous),
            seconds(row.seconds_to_authorize),
            status(row)
          ])
        })}
      </article>`
  });
}

function input(label, name, value, placeholder = '', required = false) {
  return `<label>${escapeHtml(label)}
    <input name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}>
  </label>`;
}

function sessionsTable(rows) {
  return table({
    headers: ['Data', 'Loja', 'Nome', 'Telefone', 'MAC', 'AP', 'Liberacao', 'Status'],
    rows: rows.map((row) => [
      formatDate(row.created_at),
      row.store_name,
      row.nome || '',
      row.telefone ? raw(phoneLink(row.telefone)) : '',
      row.mac,
      row.ap || '',
      seconds(row.seconds_to_authorize),
      status(row)
    ])
  });
}

function metric(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong></article>`;
}

function table({ headers, rows }) {
  if (!rows.length) return '<p class="empty">Nenhum dado encontrado ainda.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function phoneLink(telefone) {
  return `<a href="/admin/phones/${encodeURIComponent(telefone)}">${escapeHtml(displayPhone(telefone))}</a>`;
}

function status(row) {
  if (row.autorizado) return raw('<span class="badge ok">Autorizado</span>');
  if (row.otp_validado) return raw('<span class="badge warn">OTP validado</span>');
  return raw('<span class="badge muted">Pendente</span>');
}

function raw(html) {
  return { __html: html };
}

function renderCell(cell) {
  if (cell && typeof cell === 'object' && Object.hasOwn(cell, '__html')) return cell.__html;
  return escapeHtml(cell ?? '');
}

function percent(part, total) {
  if (!Number(total)) return 0;
  return Math.round((Number(part || 0) / Number(total)) * 100);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Campo_Grande',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function seconds(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const total = Math.max(0, Number(value));
  if (total < 60) return `${Math.round(total)}s`;
  const mins = Math.floor(total / 60);
  const secs = Math.round(total % 60);
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

function minutes(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const total = Number(value);
  if (total < 60) return `${Math.round(total)} min`;
  const hours = Math.round(total / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} dias`;
}

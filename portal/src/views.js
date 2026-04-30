import { displayPhone } from './phone.js';

function layout({ title, body, error = '', step = 1 }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
  <link rel="stylesheet" href="/public/styles.css">
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="brand">WiFi Visitante</div>
      <div class="steps" aria-label="Etapa ${step} de 5"><span style="width:${step * 20}%"></span></div>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      ${body}
    </section>
  </main>
</body>
</html>`;
}

export function lgpdView({ store, error }) {
  return layout({
    title: 'Acesso WiFi',
    step: 1,
    error,
    body: `<h1>${escapeHtml(store?.name || 'Bem-vindo')}</h1>
      <p>Para liberar seu acesso, precisamos validar seu telefone por WhatsApp e registrar seu consentimento.</p>
      <form method="post" action="/register" class="form">
        <label class="check">
          <input type="checkbox" name="lgpd" value="yes" required>
          <span>Concordo com o uso dos meus dados para autenticar o WiFi e receber comunicacoes da loja.</span>
        </label>
        <label>Nome
          <input name="nome" autocomplete="name" minlength="2" maxlength="120" required>
        </label>
        <label>WhatsApp
          <input name="telefone" inputmode="tel" autocomplete="tel" placeholder="(67) 99999-9999" required>
        </label>
        <button type="submit">Continuar</button>
      </form>`
  });
}

export function otpView({ telefone, error, sent = false }) {
  return layout({
    title: 'Validar WhatsApp',
    step: 3,
    error,
    body: `<h1>Digite o codigo</h1>
      <p>Enviamos um codigo de 6 digitos para ${escapeHtml(displayPhone(telefone))}.</p>
      ${sent ? '<p class="ok">Codigo enviado.</p>' : ''}
      <form method="post" action="/validate-otp" class="form">
        <label>Codigo
          <input name="codigo" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
        </label>
        <button type="submit">Validar</button>
      </form>
      <form method="post" action="/send-otp" class="secondary-form">
        <button class="secondary" type="submit">Reenviar codigo</button>
      </form>`
  });
}

export function googleReviewView({ store, error }) {
  const reviewUrl = store?.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(store.google_place_id)}`
    : '';
  return layout({
    title: 'Avalie a loja',
    step: 4,
    error,
    body: `<h1>Obrigado pela visita</h1>
      <p>Sua avaliacao ajuda nossa equipe. Ela e opcional: o WiFi sera liberado mesmo se voce preferir continuar agora.</p>
      ${reviewUrl ? `<a class="button secondary" target="_blank" rel="noopener" href="${reviewUrl}">Avaliar no Google</a>` : ''}
      <form method="post" action="/authorize" class="form">
        <button type="submit">Liberar internet</button>
      </form>`
  });
}

export function doneView() {
  return layout({
    title: 'WiFi liberado',
    step: 5,
    body: `<h1>Internet liberada</h1>
      <p>Pronto. Voce ja pode navegar normalmente.</p>
      <a class="button" href="http://neverssl.com/">Abrir navegador</a>`
  });
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

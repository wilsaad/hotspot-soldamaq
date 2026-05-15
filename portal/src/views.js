import { displayPhone } from './phone.js';

function layout({ title, body, error = '', step = 1 }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
  <link rel="stylesheet" href="/public/styles.css?v=20260515-1">
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="brand">
        <img src="/public/images/soldamaq-logo-campaign.png" alt="Soldamaq">
      </div>
      <div class="steps" aria-label="Etapa ${step} de 5"><span style="width:${step * 20}%"></span></div>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      ${body}
    </section>
  </main>
</body>
</html>`;
}

export function lgpdView({ store, error, entryAuthorized = false }) {
  return layout({
    title: 'Acesso WiFi',
    step: 1,
    error,
    body: `<h1>${escapeHtml(store?.name || 'Bem-vindo')}</h1>
      <p>${entryAuthorized
        ? `Sua internet ja esta liberada por ${escapeHtml(store.entry_guest_minutes)} minutos. Cadastre seu WhatsApp para continuar por mais tempo.`
        : 'Para liberar seu acesso, precisamos validar seu telefone por WhatsApp e registrar seu consentimento.'}</p>
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
    body: `<h1>Valide pelo WhatsApp</h1>
      <p>${telefone ? `Enviamos um link para ${escapeHtml(displayPhone(telefone))}.` : 'O acesso agora e validado por link no WhatsApp.'}</p>
      ${sent ? '<p class="ok">Link enviado.</p>' : ''}
      <p>Abra o WhatsApp e toque no link recebido para estender seu acesso. Se o link expirou, conecte-se novamente ao WiFi para receber outro.</p>
      <form method="post" action="/send-otp" class="secondary-form">
        <button class="secondary" type="submit">Enviar novo link</button>
      </form>`
  });
}

export function temporaryAccessView({ telefone, minutes, extendedMinutes }) {
  return layout({
    title: 'Internet liberada',
    step: 3,
    body: `<div class="wait-state" data-probe-url="https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png" data-next-url="http://neverssl.com/">
        <div class="logo-spinner" aria-hidden="true">
          <img src="/public/images/soldamaq-logo-campaign.png" alt="">
        </div>
        <h1>Ativando seu acesso</h1>
        <p id="wait-message">Aguarde alguns segundos enquanto confirmamos a liberacao da internet.</p>
        <p class="countdown">Verificando em <strong id="wait-count">3</strong>s</p>
        <a class="button fallback-button" href="http://neverssl.com/" hidden>Abrir navegador</a>
      </div>
      <div class="ready-state" hidden>
        <h1>Internet liberada por ${escapeHtml(minutes)} minutos</h1>
        <p>Enviamos um link para ${escapeHtml(displayPhone(telefone))} no WhatsApp.</p>
        <p>Para estender seu acesso por mais ${escapeHtml(extendedMinutes)} minutos, clique no link recebido no WhatsApp.</p>
        <a class="button" href="http://neverssl.com/">Abrir navegador</a>
      </div>
      <script>
        (() => {
          const waitState = document.querySelector('.wait-state');
          const readyState = document.querySelector('.ready-state');
          const counter = document.querySelector('#wait-count');
          const message = document.querySelector('#wait-message');
          const fallbackButton = document.querySelector('.fallback-button');
          const probeUrl = waitState.dataset.probeUrl;
          const nextUrl = waitState.dataset.nextUrl;
          let seconds = 3;
          let attempts = 0;
          let finished = false;

          function showReady() {
            if (finished) return;
            finished = true;
            waitState.hidden = true;
            readyState.hidden = false;
            window.setTimeout(() => window.location.assign(nextUrl), 1800);
          }

          function probeInternet() {
            if (finished) return;
            attempts += 1;
            const image = new Image();
            const timeout = window.setTimeout(scheduleRetry, 4500);
            image.onload = () => {
              window.clearTimeout(timeout);
              showReady();
            };
            image.onerror = () => {
              window.clearTimeout(timeout);
              scheduleRetry();
            };
            image.src = probeUrl + '?hotspot=' + Date.now();
          }

          function scheduleRetry() {
            if (finished) return;
            seconds = 3;
            counter.textContent = String(seconds);
            if (attempts >= 5) {
              message.textContent = 'Ainda estamos aguardando a liberacao completa da internet.';
              fallbackButton.hidden = false;
            }
            window.setTimeout(probeInternet, 3000);
          }

          window.setInterval(() => {
            if (finished) return;
            seconds = Math.max(0, seconds - 1);
            counter.textContent = String(seconds);
          }, 1000);

          window.setTimeout(probeInternet, 3000);
        })();
      </script>`
  });
}

export function validationErrorView({ error }) {
  return layout({
    title: 'Validar WhatsApp',
    step: 4,
    error,
    body: `<h1>Link invalido</h1>
      <p>O link de validacao expirou ou ja foi utilizado. Conecte-se novamente ao WiFi para receber um novo link.</p>`
  });
}

export function validationConfirmView({ token, telefone, extendedMinutes }) {
  return layout({
    title: 'Validar WhatsApp',
    step: 4,
    body: `<h1>Confirmar WhatsApp</h1>
      <p>Toque no botao abaixo para confirmar seu telefone ${escapeHtml(displayPhone(telefone))} e estender seu acesso por mais ${escapeHtml(extendedMinutes)} minutos.</p>
      <form method="post" action="/whatsapp/validate/${encodeURIComponent(token)}" class="form">
        <button type="submit">Validar WhatsApp</button>
      </form>`
  });
}

export function doneView({ store } = {}) {
  const reviewUrl = store?.google_review_url
    || (store?.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(store.google_place_id)}`
    : '');
  const browserUrl = reviewUrl || 'http://neverssl.com/';
  const buttonLabel = reviewUrl ? 'Avaliar loja no Google' : 'Abrir navegador';

  return layout({
    title: 'WiFi liberado',
    step: 5,
    body: `<h1>Internet liberada</h1>
      <p>Pronto. Voce ja pode navegar normalmente.</p>
      <a class="button" href="${escapeHtml(browserUrl)}">${buttonLabel}</a>`
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

# Hotspot WiFi Enterprise UniFi/MikroTik + n8n + WhatsApp

Plataforma Docker para captive portal multi-loja com validação obrigatória por WhatsApp, autorização UniFi ou MikroTik e base de dados para campanhas futuras.

## Componentes

- `nginx`: reverse proxy HTTPS para portal, n8n e Evolution API.
- `portal-app`: Node.js 20 + Express, fluxo captive portal e integração UniFi.
- `postgres`: dados de lojas, sessões, OTPs e auditoria.
- `redis`: sessão web, OTP ativo, rate limit e cache da Evolution.
- `n8n`: automações para WhatsApp.
- `evolution-api`: API WhatsApp.
- `worker`: reservado para filas e rotinas assíncronas.

## Estrutura

```text
/opt/hotspot/
  docker-compose.yml
  .env
  nginx/
  portal/
  data/
  n8n/
  docs/
```

## Deploy no Oracle Linux 9

1. Instale Docker:

```bash
sudo dnf update -y
sudo dnf install -y dnf-utils
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

2. Libere portas na OCI Security List/NSG e no firewall do host:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

3. Copie o projeto para `/opt/hotspot`:

```bash
sudo mkdir -p /opt/hotspot
sudo chown -R $USER:$USER /opt/hotspot
cp -a . /opt/hotspot/
cd /opt/hotspot
cp .env.example .env
```

4. Edite `.env` com domínio, senhas, UniFi e chaves.

5. Bootstrap HTTP para emitir TLS:

```bash
mv nginx/conf.d/hotspot.conf nginx/conf.d/hotspot.conf.disabled
mv nginx/conf.d/hotspot.bootstrap.conf.disabled nginx/conf.d/hotspot.bootstrap.conf
docker compose up -d postgres redis portal-app n8n evolution-api nginx
docker compose --profile tls run --rm certbot certonly --webroot \
  --webroot-path /var/www/certbot \
  -d hotspot.exemplo.com.br \
  --cert-name hotspot \
  --email admin@exemplo.com.br \
  --agree-tos --no-eff-email
mv nginx/conf.d/hotspot.conf.disabled nginx/conf.d/hotspot.conf
mv nginx/conf.d/hotspot.bootstrap.conf nginx/conf.d/hotspot.bootstrap.conf.disabled
docker compose up -d
```

6. Renovação do certificado:

```bash
docker compose --profile tls run --rm certbot renew
docker compose exec nginx nginx -s reload
```

## Configuração UniFi

No UniFi Network, configure o Guest Hotspot para usar portal externo:

```text
https://hotspot.exemplo.com.br/portal
```

Garanta que o controller envie `mac`, `ap`, `ssid` e `site`. O portal aceita URLs como:

```text
https://hotspot.exemplo.com.br/portal?mac=aa:bb:cc:dd:ee:ff&ap=ap01&ssid=Visitantes&site=loja01
```

O portal chama `authorize-guest` com o MAC validado. Exemplos manuais estão em `docs/unifi-api-examples.md`.

## Configuração MikroTik

Para usar o HotSpot local do MikroTik e manter o UniFi apenas como bridge da VLAN, veja:

- `docs/mikrotik-hotspot.md`
- `deploy/mikrotik/soldamaq-hotspot-vlan400.rsc`

O script preserva a `vlan400`, IP e DHCP existentes e cria apenas o HotSpot, perfis de 7/120 minutos, usuarios locais e a pagina de redirecionamento para o portal externo.

## Lojas

Cadastre as 11 lojas em `stores`:

```sql
insert into stores (name, unifi_site, google_place_id, ap_aliases)
values
  ('Loja Campo Grande', 'loja-cg', 'ChIJxxxxxxxx', '{"ap-cg-01","ap-cg-02"}');
```

`unifi_site` deve bater com o site no UniFi. `google_place_id` é opcional; se estiver vazio, a etapa de avaliação continua não obrigatória.

## n8n

Importe os workflows em:

- `n8n/examples/hotspot-send-otp.workflow.json`
- `n8n/examples/hotspot-post-login.workflow.json`

Webhook esperado pelo portal:

```json
{
  "nome": "Maria",
  "telefone": "5567999999999",
  "mac": "aa:bb:cc:dd:ee:ff",
  "ap": "ap01",
  "ssid": "Visitantes",
  "site": "loja01",
  "codigo": "123456",
  "expiracao": "2026-04-30T12:00:00.000Z",
  "evento": "send_otp"
}
```

Mensagem OTP:

```text
Seu codigo e: 123456
```

Mensagem pós-login:

```text
Obrigado pela visita! Avalie nossa loja: [link]
```

## Evolution API

Depois de subir os containers, acesse:

```text
https://hotspot.exemplo.com.br/evolution
```

Crie/conecte a instância definida em `EVOLUTION_INSTANCE`. Os workflows usam:

```http
POST /message/sendText/{instance}
apikey: EVOLUTION_API_KEY
```

## Segurança

- Telefone BR normalizado para `55DDDNUMERO`.
- OTP expira em 5 minutos por padrão.
- Reenvio bloqueado por 60 segundos.
- Limite de envios por janela configurável.
- Sessões HTTP em Redis.
- Auditoria em `audit_logs`.
- LGPD obrigatória antes do envio do OTP.

## Operação

Logs:

```bash
docker compose logs -f portal-app
docker compose logs -f nginx
docker compose logs -f evolution-api
```

Saúde:

```bash
curl -k https://hotspot.exemplo.com.br/healthz
```

Backup básico:

```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > hotspot.sql
```

## Observações

A avaliação no Google é incentivo, nunca bloqueio. A liberação depende somente de LGPD, cadastro, OTP validado por WhatsApp e autorização bem-sucedida no UniFi.

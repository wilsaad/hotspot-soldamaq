# Deploy na VM OCI existente

Estado encontrado em `157.151.19.51`:

- n8n em `/srv/n8n`, container `automation_n8n`, rede `automation_net`.
- Nginx em `/srv/nginx/conf/n8n.conf`, container `automation_nginx`, portas `80/443`.
- Evolution API em `/srv/evolution`, container `evolution_nocsaad`, porta host `8081`, versão `2.3.7`.

Este perfil sobe somente:

- `hotspot_portal`
- `hotspot_postgres`
- `hotspot_redis`
- `hotspot_worker`

## Passos

```bash
sudo mkdir -p /opt/hotspot
sudo chown -R hotspot-deploy:hotspot-deploy /opt/hotspot
cd /opt/hotspot
git clone https://github.com/wilsaad/hotspot-soldamaq.git .
cp .env.oci.example .env
```

Edite `.env` com senhas fortes, UniFi e o segredo compartilhado com o n8n.

Suba o portal:

```bash
docker compose -f docker-compose.oci.yml up -d --build
```

Copie o include de headers para o Nginx existente:

```bash
sudo cp deploy/oci/proxy-hotspot-headers.conf /srv/nginx/conf/proxy-hotspot-headers.conf
```

Adicione o conteudo de `deploy/oci/nginx-hotspot-locations.conf` dentro do bloco `server { listen 443 ssl; ... }` em:

```text
/srv/nginx/conf/n8n.conf
```

Teste e recarregue o Nginx:

```bash
docker exec automation_nginx nginx -t
docker exec automation_nginx nginx -s reload
```

Teste:

```bash
curl -k https://automation.soldamaq.com.br/healthz
curl -k "https://automation.soldamaq.com.br/portal?mac=aa:bb:cc:dd:ee:ff&ap=ap01&ssid=Visitantes&site=default"
```

## n8n e Evolution

O portal chama:

```text
http://automation_n8n:5678/webhook/hotspot-send-otp
http://automation_n8n:5678/webhook/hotspot-post-login
```

Para os workflows chamarem a Evolution por nome de container, conecte o n8n na rede da Evolution ou use a porta host `8081`.

Opção recomendada:

```bash
docker network connect evolution_evolution_net automation_n8n
```

Depois, adicione estas variaveis no servico `n8n` em `/srv/n8n/docker-compose.yml`:

```yaml
      EVOLUTION_BASE_URL: http://evolution_nocsaad:8080
      EVOLUTION_INSTANCE: <nome-da-instancia>
      EVOLUTION_API_KEY: <AUTHENTICATION_API_KEY da Evolution>
```

Recrie o n8n para carregar as novas variaveis:

```bash
cd /srv/n8n
docker compose up -d n8n
```

Os workflows em `n8n/examples/` usam essas variaveis. Alternativamente, nos nodes HTTP Request do n8n, use diretamente:

```text
http://evolution_nocsaad:8080/message/sendText/{instance}
```

com o header:

```text
apikey: <AUTHENTICATION_API_KEY da Evolution>
```

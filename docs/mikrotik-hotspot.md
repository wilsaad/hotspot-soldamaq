# MikroTik HotSpot na VLAN 400

Este modo deixa o UniFi apenas como bridge WiFi e move o captive portal para o gateway MikroTik local.

## Premissas

- A interface `vlan400-Piloto-HOTSPOT` ja existe no MikroTik.
- IP, DHCP e NAT da VLAN 400 ja funcionam.
- O SSID `SOLDAMAQ-CLIENTES` entrega clientes na VLAN 400.
- O portal externo responde em `https://automation.soldamaq.com.br`.

## Aplicacao

1. Edite `deploy/mikrotik/soldamaq-hotspot-vlan400.rsc`:
   - `hotspotInterface` (na Matriz: `vlan400-Piloto-HOTSPOT`)
   - `hotspotGateway`
   - `entryPassword`
   - `extendedPassword`
2. Importe no RouterOS:

```routeros
/import file-name=soldamaq-hotspot-vlan400.rsc
```

3. Envie a pagina local do HotSpot ao roteador:

```bash
scp deploy/mikrotik/hotspot-soldamaq/login.html automationsaad@172.16.101.1:hotspot-soldamaq/login.html
```

4. No portal, configure as mesmas senhas em:

```env
MIKROTIK_ENTRY_USERNAME=soldamaq7
MIKROTIK_ENTRY_PASSWORD=...
MIKROTIK_EXTENDED_USERNAME=soldamaq120
MIKROTIK_EXTENDED_PASSWORD=...
```

5. Na loja piloto, deixe `auth_backend=mikrotik`.

## Fluxo

1. MikroTik intercepta o cliente na VLAN 400.
2. `login.html` local envia `mac`, `ip`, `link-login-only`, `link-orig`, `site` e `ssid` ao portal externo.
3. O portal devolve um POST invisivel para o `link-login-only`:
   - `soldamaq7` para 7 minutos
   - `soldamaq120` depois da validacao do WhatsApp
4. A sessao e aplicada localmente no gateway MikroTik.

## Observacoes

- O script nao altera endereco IP, DHCP, bridge, NAT ou a VLAN existente.
- O walled garden web libera o portal externo e os hosts de certificado usados antes da autenticacao.
- O walled garden IP libera DNS para `8.8.8.8` e `8.8.4.4` em TCP/UDP 53 e HTTPS direto para `157.151.19.51`.
- O modo usa `http-pap` no HotSpot para permitir o POST local com usuarios de perfil.

## Captive portal por DHCP

Em redes onde a interceptacao HTTP nativa do HotSpot nao e acionada por causa da topologia `bridge + VLAN + use-ip-firewall-for-vlan`, anuncie a API de captive portal via DHCP option 114 na rede `172.31.255.0/24`.

Endpoint da API por loja:

```text
https://automation.soldamaq.com.br/captive-portal/api?site=CODIGO_DA_LOJA&ssid=SOLDAMAQ-CLIENTES
```

Resposta esperada:

```json
{
  "captive": true,
  "user-portal-url": "https://automation.soldamaq.com.br/mikrotik/portal?source=dhcp114&site=CODIGO_DA_LOJA&ssid=SOLDAMAQ-CLIENTES"
}
```

O `site` precisa bater com `stores.unifi_site` no portal. Para a loja Coronel, use `vx909env`.

## Script por loja

O script da Coronel fica em:

```text
deploy/mikrotik/stores/soldamaq-coronel-vlan400.rsc
```

Antes de importar:

- confirme `hotspotInterface`, `hotspotGateway`, `hotspotNetwork` e `dhcpServer`;
- substitua `__MIKROTIK_WEBHOOK_SECRET__` pelo valor de `MIKROTIK_WEBHOOK_SECRET`;
- confirme que a loja esta com `auth_backend='mikrotik'` no portal.

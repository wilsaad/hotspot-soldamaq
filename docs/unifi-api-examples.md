# Exemplos UniFi Network API

## Login UniFi OS / Cloud Key / UDM

```bash
curl -k -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"username":"hotspot-api","password":"SENHA"}' \
  https://unifi.exemplo.com/api/auth/login
```

## Autorizar convidado por MAC

```bash
curl -k -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"authorize-guest","mac":"aa:bb:cc:dd:ee:ff","minutes":480}' \
  https://unifi.exemplo.com/proxy/network/api/s/default/cmd/stamgr
```

## Controller legado

```bash
curl -k -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"username":"hotspot-api","password":"SENHA"}' \
  https://unifi.exemplo.com:8443/api/login

curl -k -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"authorize-guest","mac":"aa:bb:cc:dd:ee:ff","minutes":480}' \
  https://unifi.exemplo.com:8443/api/s/default/cmd/stamgr
```

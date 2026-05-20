# Soldamaq - Coronel Antonino
# Importar no MikroTik da loja depois de conferir as variaveis abaixo.
# Este script assume que a VLAN400, IP, pool DHCP e NAT base ja existem.

:local storeSite "vx909env"
:local ssid "SOLDAMAQ-CLIENTES"
:local hotspotInterface "vlan400-SOLDAMAQ CLIENTES"
:local hotspotGateway "172.31.255.1"
:local hotspotNetwork "172.31.255.0/24"
:local dhcpServer "server6-WIFI SOLDAMAQ CLIENTES"
:local dhcpOptionName "soldamaq-captive-api"
:local portalBase "https://automation.soldamaq.com.br"
:local portalHost "automation.soldamaq.com.br"
:local portalIp "157.151.19.51"

# Trocar antes de importar em producao. Use o mesmo valor de MIKROTIK_WEBHOOK_SECRET no portal.
:local portalSecret "__MIKROTIK_WEBHOOK_SECRET__"

:local captiveApiUrl ($portalBase . "/captive-portal/api?site=" . $storeSite . "&ssid=" . $ssid)
:local leaseWebhookUrl ($portalBase . "/mikrotik/lease")

/ip dhcp-server option
:if ([:len [find where name=$dhcpOptionName]] = 0) do={
  add name=$dhcpOptionName code=114 value=("'" . $captiveApiUrl . "'")
} else={
  set [find where name=$dhcpOptionName] code=114 value=("'" . $captiveApiUrl . "'")
}

/ip dhcp-server network
:if ([:len [find where gateway=$hotspotGateway]] > 0) do={
  set [find where gateway=$hotspotGateway] dhcp-option=$dhcpOptionName
}

/ip hotspot profile
:if ([:len [find where name="hsprof-soldamaq"]] = 0) do={
  add name="hsprof-soldamaq" hotspot-address=$hotspotGateway dns-name="hotspot.soldamaq.local" html-directory="hotspot-soldamaq" login-by=http-pap,cookie use-radius=no
} else={
  set [find where name="hsprof-soldamaq"] hotspot-address=$hotspotGateway dns-name="hotspot.soldamaq.local" html-directory="hotspot-soldamaq" login-by=http-pap,cookie use-radius=no
}

/ip hotspot
:if ([:len [find where name="hotspot-soldamaq"]] = 0) do={
  add name="hotspot-soldamaq" interface=$hotspotInterface address-pool=none profile="hsprof-soldamaq" disabled=no
} else={
  set [find where name="hotspot-soldamaq"] interface=$hotspotInterface address-pool=none profile="hsprof-soldamaq" disabled=no
}

/ip hotspot walled-garden
:if ([:len [find where dst-host=$portalHost]] = 0) do={ add dst-host=$portalHost comment="SOLDAMAQ portal" }
:if ([:len [find where dst-host="*.soldamaq.com.br"]] = 0) do={ add dst-host="*.soldamaq.com.br" comment="SOLDAMAQ dominios" }
:if ([:len [find where dst-host="e8.i.lencr.org"]] = 0) do={ add dst-host="e8.i.lencr.org" comment="LetsEncrypt issuer" }
:if ([:len [find where dst-host="e8.c.lencr.org"]] = 0) do={ add dst-host="e8.c.lencr.org" comment="LetsEncrypt cert" }

/ip hotspot walled-garden ip
:if ([:len [find where dst-address=$portalIp protocol=tcp dst-port=443]] = 0) do={ add dst-address=$portalIp protocol=tcp dst-port=443 comment="SOLDAMAQ portal HTTPS" }
:if ([:len [find where dst-address=8.8.8.8 protocol=udp dst-port=53]] = 0) do={ add dst-address=8.8.8.8 protocol=udp dst-port=53 comment="Google DNS UDP" }
:if ([:len [find where dst-address=8.8.8.8 protocol=tcp dst-port=53]] = 0) do={ add dst-address=8.8.8.8 protocol=tcp dst-port=53 comment="Google DNS TCP" }
:if ([:len [find where dst-address=8.8.4.4 protocol=udp dst-port=53]] = 0) do={ add dst-address=8.8.4.4 protocol=udp dst-port=53 comment="Google DNS UDP" }
:if ([:len [find where dst-address=8.8.4.4 protocol=tcp dst-port=53]] = 0) do={ add dst-address=8.8.4.4 protocol=tcp dst-port=53 comment="Google DNS TCP" }

/ip firewall mangle
:if ([:len [find where comment="SOLDAMAQ HOTSPOT keep main table"]] = 0) do={
  add chain=prerouting action=accept src-address=$hotspotNetwork comment="SOLDAMAQ HOTSPOT keep main table" place-before=0
} else={
  set [find where comment="SOLDAMAQ HOTSPOT keep main table"] chain=prerouting action=accept src-address=$hotspotNetwork
}

/ip firewall filter
/ip firewall filter remove [find comment="SOLDAMAQ VLAN400 internet after hotspot"]
:local beforeBogon [find where chain=forward src-address=$hotspotNetwork dst-address-list=BOGONS]
:if ([:len $beforeBogon] > 0) do={
  add chain=forward action=accept src-address=$hotspotNetwork dst-address-list=!BOGONS comment="SOLDAMAQ VLAN400 internet after hotspot" place-before=[:pick $beforeBogon 0]
} else={
  add chain=forward action=accept src-address=$hotspotNetwork dst-address-list=!BOGONS comment="SOLDAMAQ VLAN400 internet after hotspot"
}

/ip firewall nat
:if ([:len [find where comment="SOLDAMAQ masquerade hotspot network"]] = 0) do={
  add chain=srcnat action=masquerade src-address=$hotspotNetwork comment="SOLDAMAQ masquerade hotspot network"
}

/ip dhcp-server
set [find where name=$dhcpServer] lease-time=5m lease-script=(":local portal \"" . $leaseWebhookUrl . "\"; :local secret \"" . $portalSecret . "\"; :local site \"" . $storeSite . "\"; :local ssid \"" . $ssid . "\"; :if (\$leaseBound = \"1\") do={ :local mac \$leaseActMAC; :local ip \$leaseActIP; :local c (\"SOLDAMAQ-AUTO-7M \" . \$mac); :local s (\"soldamaq-\" . \$ip); /ip hotspot ip-binding remove [find comment=\$c]; /ip hotspot ip-binding remove [find mac-address=\$mac address=\$ip]; /system scheduler remove [find name=\$s]; /ip hotspot ip-binding add mac-address=\$mac address=\$ip type=bypassed comment=\$c; /system scheduler add name=\$s interval=7m on-event=(\"/ip hotspot ip-binding remove [find comment=\\\"\" . \$c . \"\\\"]; /ip hotspot active remove [find mac-address=\\\"\" . \$mac . \"\\\"]; /ip hotspot host remove [find mac-address=\\\"\" . \$mac . \"\\\"]; /ip firewall connection remove [find src-address~\\\"\" . \$ip . \"\\\"]; /ip firewall connection remove [find dst-address~\\\"\" . \$ip . \"\\\"]; /system scheduler remove [find name=\\\"\" . \$s . \"\\\"]\"); /tool fetch url=(\$portal . \"?secret=\" . \$secret . \"&site=\" . \$site . \"&ssid=\" . \$ssid . \"&mac=\" . \$mac . \"&ip=\" . \$ip . \"&status=bound\") keep-result=no; } else={ :local mac \$leaseActMAC; :local ip \$leaseActIP; :local c (\"SOLDAMAQ-AUTO-7M \" . \$mac); :local s (\"soldamaq-\" . \$ip); /ip hotspot ip-binding remove [find comment=\$c]; /ip hotspot ip-binding remove [find mac-address=\$mac address=\$ip]; /ip hotspot active remove [find mac-address=\$mac]; /ip hotspot host remove [find mac-address=\$mac]; /system scheduler remove [find name=\$s]; /ip firewall connection remove [find src-address~\$ip]; /ip firewall connection remove [find dst-address~\$ip]; /tool fetch url=(\$portal . \"?secret=\" . \$secret . \"&site=\" . \$site . \"&ssid=\" . \$ssid . \"&mac=\" . \$mac . \"&ip=\" . \$ip . \"&status=unbound\") keep-result=no; }")

:put ("SOLDAMAQ Coronel hotspot configurado. Captive API: " . $captiveApiUrl)

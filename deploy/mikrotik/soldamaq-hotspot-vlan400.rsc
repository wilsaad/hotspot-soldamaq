# Ajuste estes valores antes de importar.
:local hotspotInterface "vlan400-Piloto-HOTSPOT"
:local hotspotGateway "172.31.255.1"
:local portalHost "automation.soldamaq.com.br"
:local portalUrl "https://automation.soldamaq.com.br/mikrotik/portal"
:local siteCode "btmae4e2"
:local entryUser "soldamaq7"
:local entryPassword "TROQUE-SENHA-7MIN"
:local extendedUser "soldamaq120"
:local extendedPassword "TROQUE-SENHA-120MIN"

/ip hotspot profile
:if ([:len [find where name="hsprof-soldamaq"]] = 0) do={
  add name="hsprof-soldamaq" hotspot-address=$hotspotGateway dns-name="wifi.soldamaq.local" html-directory="hotspot-soldamaq" login-by=http-pap,cookie use-radius=no
} else={
  set [find where name="hsprof-soldamaq"] hotspot-address=$hotspotGateway dns-name="wifi.soldamaq.local" html-directory="hotspot-soldamaq" login-by=http-pap,cookie use-radius=no
}

/ip hotspot user profile
:if ([:len [find where name="soldamaq-entry-7m"]] = 0) do={
  add name="soldamaq-entry-7m" session-timeout=7m shared-users=500 add-mac-cookie=no
} else={
  set [find where name="soldamaq-entry-7m"] session-timeout=7m shared-users=500 add-mac-cookie=no
}
:if ([:len [find where name="soldamaq-validated-120m"]] = 0) do={
  add name="soldamaq-validated-120m" session-timeout=2h shared-users=500 add-mac-cookie=yes mac-cookie-timeout=2h
} else={
  set [find where name="soldamaq-validated-120m"] session-timeout=2h shared-users=500 add-mac-cookie=yes mac-cookie-timeout=2h
}

/ip hotspot user
:if ([:len [find where name=$entryUser]] = 0) do={
  add name=$entryUser password=$entryPassword profile="soldamaq-entry-7m"
} else={
  set [find where name=$entryUser] password=$entryPassword profile="soldamaq-entry-7m"
}
:if ([:len [find where name=$extendedUser]] = 0) do={
  add name=$extendedUser password=$extendedPassword profile="soldamaq-validated-120m"
} else={
  set [find where name=$extendedUser] password=$extendedPassword profile="soldamaq-validated-120m"
}

/ip hotspot
:if ([:len [find where name="hotspot-soldamaq"]] = 0) do={
  add name="hotspot-soldamaq" interface=$hotspotInterface address-pool=none profile="hsprof-soldamaq" disabled=no
} else={
  set [find where name="hotspot-soldamaq"] interface=$hotspotInterface address-pool=none profile="hsprof-soldamaq" disabled=no
}

/ip hotspot walled-garden
:if ([:len [find where dst-host=$portalHost]] = 0) do={
  add dst-host=$portalHost comment="Soldamaq portal externo"
}
:if ([:len [find where dst-host="*.soldamaq.com.br"]] = 0) do={
  add dst-host="*.soldamaq.com.br" comment="Soldamaq dominios"
}
:if ([:len [find where dst-host="e8.i.lencr.org"]] = 0) do={
  add dst-host="e8.i.lencr.org" comment="Lets Encrypt issuer"
}
:if ([:len [find where dst-host="e8.c.lencr.org"]] = 0) do={
  add dst-host="e8.c.lencr.org" comment="Lets Encrypt cert"
}

/ip hotspot walled-garden ip
:if ([:len [find where server="hotspot-soldamaq" dst-address="8.8.8.8" protocol=udp dst-port=53]] = 0) do={
  add server="hotspot-soldamaq" dst-address=8.8.8.8 protocol=udp dst-port=53 comment="Google DNS UDP"
}
:if ([:len [find where server="hotspot-soldamaq" dst-address="8.8.8.8" protocol=tcp dst-port=53]] = 0) do={
  add server="hotspot-soldamaq" dst-address=8.8.8.8 protocol=tcp dst-port=53 comment="Google DNS TCP"
}
:if ([:len [find where server="hotspot-soldamaq" dst-address="8.8.4.4" protocol=udp dst-port=53]] = 0) do={
  add server="hotspot-soldamaq" dst-address=8.8.4.4 protocol=udp dst-port=53 comment="Google DNS UDP"
}
:if ([:len [find where server="hotspot-soldamaq" dst-address="8.8.4.4" protocol=tcp dst-port=53]] = 0) do={
  add server="hotspot-soldamaq" dst-address=8.8.4.4 protocol=tcp dst-port=53 comment="Google DNS TCP"
}
:if ([:len [find where server="hotspot-soldamaq" dst-address="157.151.19.51" protocol=tcp dst-port=443]] = 0) do={
  add server="hotspot-soldamaq" dst-address=157.151.19.51 protocol=tcp dst-port=443 comment="Portal HTTPS"
}

# Copie o arquivo deploy/mikrotik/hotspot-soldamaq/login.html para
# hotspot-soldamaq/login.html no roteador antes de ativar a loja.

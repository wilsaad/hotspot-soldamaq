# Ajuste estes valores antes de importar.
:local hotspotInterface "vlan400"
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

/file
:if ([:len [find where name="hotspot-soldamaq/login.html"]] = 0) do={
  add name="hotspot-soldamaq/login.html" contents=("<!doctype html>\r\n<html>\r\n<head><meta charset=\"utf-8\"><title>Soldamaq WiFi</title></head>\r\n<body>\r\n<form name=\"redirect\" action=\"" . $portalUrl . "\" method=\"post\">\r\n<input type=\"hidden\" name=\"mac\" value=\"\$(mac)\">\r\n<input type=\"hidden\" name=\"ip\" value=\"\$(ip)\">\r\n<input type=\"hidden\" name=\"link-login-only\" value=\"\$(link-login-only)\">\r\n<input type=\"hidden\" name=\"link-orig\" value=\"\$(link-orig)\">\r\n<input type=\"hidden\" name=\"site\" value=\"" . $siteCode . "\">\r\n<input type=\"hidden\" name=\"ssid\" value=\"SOLDAMAQ-CLIENTES\">\r\n</form>\r\n<script>document.redirect.submit();</script>\r\n</body>\r\n</html>")
} else={
  set [find where name="hotspot-soldamaq/login.html"] contents=("<!doctype html>\r\n<html>\r\n<head><meta charset=\"utf-8\"><title>Soldamaq WiFi</title></head>\r\n<body>\r\n<form name=\"redirect\" action=\"" . $portalUrl . "\" method=\"post\">\r\n<input type=\"hidden\" name=\"mac\" value=\"\$(mac)\">\r\n<input type=\"hidden\" name=\"ip\" value=\"\$(ip)\">\r\n<input type=\"hidden\" name=\"link-login-only\" value=\"\$(link-login-only)\">\r\n<input type=\"hidden\" name=\"link-orig\" value=\"\$(link-orig)\">\r\n<input type=\"hidden\" name=\"site\" value=\"" . $siteCode . "\">\r\n<input type=\"hidden\" name=\"ssid\" value=\"SOLDAMAQ-CLIENTES\">\r\n</form>\r\n<script>document.redirect.submit();</script>\r\n</body>\r\n</html>")
}

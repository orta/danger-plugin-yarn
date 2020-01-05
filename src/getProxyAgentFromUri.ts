import { Agent } from "http"
import HttpsProxyAgent from "https-proxy-agent"
import { URL } from "url"

import { YarnConfig } from "./getYarnConfig"

function formatHostname(hostname: string): string {
  // canonicalize the hostname, so that 'oogle.com' won't match 'google.com'
  return hostname.replace(/^\.*/, ".").toLowerCase()
}

function parseNoProxyZone(zone: string): Readonly<{ hostname: string; port: string; hasPort: boolean }> {
  zone = zone.trim().toLowerCase()

  const zoneParts = zone.split(":", 2)
  const zoneHost = formatHostname(zoneParts[0])
  const zonePort = zoneParts[1]
  const hasPort = zone.indexOf(":") > -1

  return {
    hostname: zoneHost,
    port: zonePort,
    hasPort,
  }
}

function uriInNoProxy(uri: URL, noProxy: string): boolean {
  const port = uri.port || (uri.protocol === "https:" ? "443" : "80")
  const hostname = formatHostname(uri.hostname)
  const noProxyList = noProxy.split(",")

  // iterate through the noProxyList until it finds a match.
  return noProxyList.map(parseNoProxyZone).some(noProxyZone => {
    const isMatchedAt = hostname.indexOf(noProxyZone.hostname)
    const hostnameMatched = isMatchedAt > -1 && isMatchedAt === hostname.length - noProxyZone.hostname.length

    if (noProxyZone.hasPort) {
      return port === noProxyZone.port && hostnameMatched
    }

    return hostnameMatched
  })
}

function getProxyFromUri(uri: URL, config: YarnConfig): string | undefined {
  // Decide the proper request proxy to use based on the request URI object and the
  // environmental variables (NO_PROXY, HTTP_PROXY, etc.)
  // Respect NO_PROXY environment variables.
  // See: http://lynx.isc.org/current/breakout/lynx_help/keystrokes/environments.html
  const noProxy = process.env.NO_PROXY || process.env.no_proxy

  // If the noProxy is a wildcard then return undefined
  if (noProxy === "*") {
    return undefined
  }

  // If the noProxy is not empty and the uri is found return undefined
  if (noProxy && uriInNoProxy(uri, noProxy)) {
    return undefined
  }

  // Check for HTTP or HTTPS proxy in environment else default to undefined
  if (uri.protocol === "http:") {
    return process.env.HTTP_PROXY || process.env.http_proxy || config["http-proxy"] || config.proxy || undefined
  }

  if (uri.protocol === "https:") {
    return (
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      config["https-proxy"] ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      config["http-proxy"] ||
      config.proxy ||
      undefined
    )
  }

  // If none of that works, return undefined
  // (What uri protocol are you using then?)
  return undefined
}

export function getProxyAgentFromUri(uri: URL, config: YarnConfig): Agent | undefined {
  const proxy = getProxyFromUri(uri, config)

  if (proxy) {
    return new HttpsProxyAgent(proxy) as Agent
  }

  return undefined
}

import { YarnConfig } from "./getYarnConfig"

export type Registry = Readonly<{
  url: string
  authToken?: string
}>

export interface Registries {
  readonly default: Registry
  [scopeName: string]: Registry
}

export function getRegistries(config: YarnConfig): Registries {
  const registries = {
    default: {
      url: config.registry,
      authToken: config._auth,
    },
  }

  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith(":registry")) {
      const [scopeName] = key.split(":registry")
      const url = value
      const authToken = config[`${url}:_auth`]
      registries[scopeName] = {
        url,
        authToken,
      }
    }
  }

  return registries
}

import * as child_process from "child_process"
import { promisify } from "util"

const exec = promisify(child_process.exec)

export interface YarnConfig {
  registry: string
  _auth?: string
  "https-proxy"?: string
  "http-proxy"?: string
  proxy?: string
}

export interface YarnConfigListMessage {
  type: "info" | "inspect"
  data: object
}

export async function getYarnConfig(): Promise<YarnConfig> {
  const defaultConfig = {
    registry: "https://registry.npmjs.org/",
  }

  const { stdout } = await exec("yarn config list --json")

  if (stdout) {
    const jsonLines: YarnConfigListMessage[] = stdout.split("\n").map(line => JSON.parse(line.trim()))
    // The json lines are ordered from yarn to npm, but we wish to produce
    // a config in which npm is overridden with yarn config.
    return jsonLines.reduceRight((config, jsonLine) => {
      if (jsonLine.type === "inspect") {
        return { ...config, ...jsonLine.data }
      }

      return config
    }, defaultConfig)
  }

  return defaultConfig
}

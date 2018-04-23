# danger-plugin-yarn

[![Build Status](https://travis-ci.org/orta/danger-plugin-yarn.svg?branch=master)](https://travis-ci.org/orta/danger-plugin-yarn)
[![npm version](https://badge.fury.io/js/danger-plugin-yarn.svg)](https://badge.fury.io/js/danger-plugin-yarn)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

> Provides dependency information on dependency changes in a PR

## Usage

Install:

```sh
yarn add danger-plugin-yarn --dev
```

At a glance:

```js
// dangerfile.js
import yarn from 'danger-plugin-yarn'

schedule(yarn())
```

Provides 4 separate rules:

* `checkForRelease` - Provides a 🎉 when there's a package version bump. 
* `checkForNewDependencies` (async) - Provides npmjs.com and `yarn why` metadata about new dependencies.
* `checkForLockfileDiff` - Will warn you when there are `dependencies` or  `devDependencies` changes without a `yarn.lock` change.
* `checkForTypesInDeps` - Will fail the build if you add any `@types/[x]` to `dependencies` instead of `devDependencies`.

And exports a default function to handle all of them at once.

Note: async functions like the default one [have be to](http://danger.systems/js/guides/the_dangerfile.html#async) `schedule`'d by Danger.

## Private packages

If you want the plugin to find your private packages on npm, you need to provide an npm [authentication token](https://docs.npmjs.com/getting-started/working_with_tokens):

```js
// dangerfile.js
import yarn from 'danger-plugin-yarn'

schedule(yarn({ npmAuthToken: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }))
```

## Changelog

See the GitHub [release history](https://github.com/orta/danger-plugin-yarn/releases).

## Contributing

See [CONTRIBUTING.md](contributing.md).

## What does this look like?

The rest of this README is the contents of what it looks like when you add this plugin to your Dangerfile:

---

<table>
  <thead>
    <tr>
      <th width="50"></th>
      <th width="100%" data-danger-table="true">Warnings</th>
    </tr>
  </thead>
  <tbody><tr>
      <td>:warning:</td>
      <td>

  New dependencies added: danger-plugin-yarn.
  </td>
    </tr>
  </tbody>
</table>



<h2><a href="https://github.com/orta/danger-plugin-yarn#readme">danger-plugin-yarn</a></h2>
<p>Author: Orta Therox</p>
<p>Description: Provides dependency information on dependency changes in a PR</p>
<p>Homepage: <a href="https://github.com/orta/danger-plugin-yarn#readme">https://github.com/orta/danger-plugin-yarn#readme</a></p>

<table>
  <thead><tr><th></th><th width="100%"></th></tr></thead>
  <tr><td>Created</td><td>24 days ago</td></tr><tr><td>Last Updated</td><td>3 minutes ago</td></tr><tr><td>License</td><td>MIT</td></tr><tr><td>Maintainers</td><td>1</td></tr><tr><td>Releases</td><td>14</td></tr><tr><td>Direct Dependencies</td><td><a href='http: //npmjs.com/package/date-fns'>date-fns</a>, <a href='http: //npmjs.com/package/lodash.flatten'>lodash.flatten</a>, <a href='http: //npmjs.com/package/lodash.includes'>lodash.includes</a>, <a href='http: //npmjs.com/package/node-fetch'>node-fetch</a> and <a href='http: //npmjs.com/package/esdoc'>esdoc</a></td></tr><tr><td>Keywords</td><td>danger, danger-plugin and yarn</td></tr>
</table>

<details>
<summary><code>README</code></summary>
# danger-plugin-yarn

[![Build Status](https://travis-ci.org/orta/danger-plugin-yarn.svg?branch=master)](https://travis-ci.org/orta/danger-plugin-yarn)
[![npm version](https://badge.fury.io/js/danger-plugin-yarn.svg)](https://badge.fury.io/js/danger-plugin-yarn)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

> Provides dependency information on dependency changes in a PR

## Usage

Install:

```sh
yarn add danger-plugin-yarn --dev
```

At a glance:

```js
// dangerfile.js
import yarn from 'danger-plugin-yarn'

schedule(yarn())
```

Provides 4 separate rules:

* `checkForRelease` - Provides a 🎉 when there's a package version bump. 
* `checkForNewDependencies` (async) - Provides npmjs.com and `yarn why` metadata about new dependencies.
* `checkForLockfileDiff` - Will warn you when there are `dependencies` or  `devDependencies` changes without a `yarn.lock` change.
* `checkForTypesInDeps` - Will fail the build if you add any `@types/[x]` to `dependencies` instead of `devDependencies`.

And exports a default function to handle all of them at once.

Note: async functions like the default one [have be to](http://danger.systems/js/guides/the_dangerfile.html#async) `schedule`'d by Danger.

## Changelog

See the GitHub [release history](https://github.com/orta/danger-plugin-yarn/releases).

## Contributing

See [CONTRIBUTING.md](contributing.md).

</details>




  <details>
    <summary><code>yarn why danger-plugin-yarn</code> output</summary>
    <p><code><ul><li>Has been hoisted to "danger-plugin-yarn"</li><li>This module exists because it's specified in "devDependencies".</li><li>Disk size without dependencies: "80kB"</li><li>Disk size with unique dependencies: "3.98MB"</li><li>Disk size with transitive dependencies: "4.43MB"</li><li>Number of shared dependencies: 7
    </li></ul></code></p>
  </details>
  
<p align="right">
  Generated by :no_entry_sign: <a href="http://github.com/danger/danger-js/">dangerJS</a>
</p>

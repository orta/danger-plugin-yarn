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

Note: The function has be to `schedule`'d by Danger.

## Changelog

See the GitHub [release history](https://github.com/orta/danger-plugin-yarn/releases).

## Contributing

See [CONTRIBUTING.md](contributing.md).

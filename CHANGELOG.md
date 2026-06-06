# [0.7.0](https://github.com/OTSkit/OTSkit-MCP/compare/v0.6.4...v0.7.0) (2026-06-06)


### Features

* watch now upgrades due pending stamps automatically ([ebb4666](https://github.com/OTSkit/OTSkit-MCP/commit/ebb46662857707aba621ab32204b0cc897117fec))

## [0.6.4](https://github.com/OTSkit/OTSkit-MCP/compare/v0.6.3...v0.6.4) (2026-06-05)


### Bug Fixes

* defer all filesystem access until first tool call ([4bbefb5](https://github.com/OTSkit/OTSkit-MCP/commit/4bbefb5e578e5deafbfac2485a91f6666dbfd359))

## [0.6.3](https://github.com/OTSkit/OTSkit-MCP/compare/v0.6.2...v0.6.3) (2026-06-05)


### Bug Fixes

* lazy-init database so tools/list works without filesystem access ([a90aec6](https://github.com/OTSkit/OTSkit-MCP/commit/a90aec644368784bf864c7899048a0bc625a61fc))

## [0.6.2](https://github.com/OTSkit/OTSkit-MCP/compare/v0.6.1...v0.6.2) (2026-06-05)


### Bug Fixes

* include README.md and LICENSE in npm package files ([ab343b9](https://github.com/OTSkit/OTSkit-MCP/commit/ab343b9872591bf8e31973659af7868b820aa9be))

## [0.6.1](https://github.com/OTSkit/OTSkit-MCP/compare/v0.6.0...v0.6.1) (2026-06-05)


### Bug Fixes

* exit process cleanly when stdin closes or SIGTERM received ([d43fde3](https://github.com/OTSkit/OTSkit-MCP/commit/d43fde3541876d9b886b7608288d24ad2ded39f7))
* replace better-sqlite3 with node-sqlite3-wasm for pure-WASM SQLite ([cdb594a](https://github.com/OTSkit/OTSkit-MCP/commit/cdb594adaad5c82bcaf70367e8c3d2fb4b6fc7c4))

# [0.6.0](https://github.com/OTSkit/OTSkit-MCP/compare/v0.5.0...v0.6.0) (2026-06-05)


### Bug Fixes

* update @otskit/client dependency to ^0.2.0 in package.json ([a2e916b](https://github.com/OTSkit/OTSkit-MCP/commit/a2e916bf6121ebc9e91c22fb73e6dc7e5b85fb7a))


### Features

* add hash_file tool using @otskit/client@0.2.0 hashFile ([9980088](https://github.com/OTSkit/OTSkit-MCP/commit/998008899b2352c97d154a00967062e8322cbca1))

# [0.5.0](https://github.com/OTSkit/OTSkit-MCP/compare/v0.4.3...v0.5.0) (2026-06-05)


### Features

* add stamp_file tool to compute SHA-256 and stamp a file on Bitcoin ([76d53c7](https://github.com/OTSkit/OTSkit-MCP/commit/76d53c763ceaa6c271d517d2bc1f553bc165c2a0))

## [0.4.3](https://github.com/OTSkit/OTSkit-MCP/compare/v0.4.2...v0.4.3) (2026-06-05)


### Bug Fixes

* add repository and homepage fields to package.json ([f827bfa](https://github.com/OTSkit/OTSkit-MCP/commit/f827bfafb7d37f124170637276a65c09dbc3e837))
* run build before semantic-release so dist/ is included in npm publish ([62cc592](https://github.com/OTSkit/OTSkit-MCP/commit/62cc592180e1bf8e2f1e6959cc4dfd85277b65ae))

## [0.4.2](https://github.com/OTSkit/OTSkit-MCP/compare/v0.4.1...v0.4.2) (2026-06-05)


### Bug Fixes

* add missing license field to package.json ([6aaa29f](https://github.com/OTSkit/OTSkit-MCP/commit/6aaa29f769909c4d75a38ac92ee4b0393b08924a))

## [0.4.1](https://github.com/OTSkit/OTSkit-MCP/compare/v0.4.0...v0.4.1) (2026-06-05)


### Bug Fixes

* auto-update server.json version on release ([78e27dd](https://github.com/OTSkit/OTSkit-MCP/commit/78e27dd8aae4aa366b1ee544ca7ba145ccbf2923))

# [0.4.0](https://github.com/OTSkit/OTSkit-MCP/compare/v0.3.0...v0.4.0) (2026-06-04)


### Features

* register in official MCP registry (v0.2.1) ([5abd8b6](https://github.com/OTSkit/OTSkit-MCP/commit/5abd8b62555054272a6bd9968ec74eebea4f6f65))

# [0.3.0](https://github.com/OTSkit/OTSkit-MCP/compare/v0.2.0...v0.3.0) (2026-06-04)


### Features

* add MCP registry manifest for official registration ([550ada9](https://github.com/OTSkit/OTSkit-MCP/commit/550ada9dbde74258ac72794015b0918cc375fb95))

# [0.2.0](https://github.com/OTSkit/OTSkit-MCP/compare/v0.1.7...v0.2.0) (2026-06-04)


### Features

* add setup support for Claude Code CLI ([11856e2](https://github.com/OTSkit/OTSkit-MCP/commit/11856e29a39ffd43050253f3c1002440fb98fd51))

## [0.1.7](https://github.com/OTSkit/OTSkit-MCP/compare/v0.1.6...v0.1.7) (2026-06-04)


### Bug Fixes

* remove internal retry fields from list_pending tool response ([613a01f](https://github.com/OTSkit/OTSkit-MCP/commit/613a01f3cee574537e6d10045e3be1e90c4e385f))

## [1.0.1](https://github.com/OTSkit/OTSkit-MCP/compare/v1.0.0...v1.0.1) (2026-06-04)


### Bug Fixes

* distinguish calendar vs bitcoin attestations in inspect_timestamp ([1ef5560](https://github.com/OTSkit/OTSkit-MCP/commit/1ef556001501b1933bfa64c689f811b2c10c9d33))

# 1.0.0 (2026-06-04)


### Bug Fixes

* add missing semantic-release plugins and use pnpm exec ([50d9f12](https://github.com/OTSkit/OTSkit-MCP/commit/50d9f1251d9a53a02db270da9ef0db55c3bef61d))
* bump @otskit/client to 0.1.1 to resolve file: dependency in lockfile ([8d5751c](https://github.com/OTSkit/OTSkit-MCP/commit/8d5751c03cf70cd19710681fb34e7eaa2a137a3a))
* clean CI with pnpm, semantic-release publish, and npm registry deps ([f553038](https://github.com/OTSkit/OTSkit-MCP/commit/f553038d20e8076d0944da6f4f357e86ac423d58))
* fix watch polling interval and add watch MCP tool ([daa9d68](https://github.com/OTSkit/OTSkit-MCP/commit/daa9d68a74016aa42fff7fe78b9c26719b2f4654))
* remove automatic release job from CI ([4f61af4](https://github.com/OTSkit/OTSkit-MCP/commit/4f61af4f70e2b612a41e024dce90f04b106988c3))
* remove preserve tests and source after dropping archiver ([887fb14](https://github.com/OTSkit/OTSkit-MCP/commit/887fb1478a09003df84323b6c9c7ccd1a70defb5))
* remove stale mock for renamed @alexalves87/opentimestamps package ([fb05a9e](https://github.com/OTSkit/OTSkit-MCP/commit/fb05a9eabd1ef8263d9158f0da806c35df13111c))
* replace missing @otskit/core helpers with DetachedTimestampFile API ([4d37ef0](https://github.com/OTSkit/OTSkit-MCP/commit/4d37ef0e1c5a7f4338f53e2ec087054f0f655356))
* respect next_retry_at in check-pending scheduler ([1d18ae1](https://github.com/OTSkit/OTSkit-MCP/commit/1d18ae150b3777ecbaa7e5b09572cdfef72091ae))
* update pnpm-lock.yaml with @otskit/client@0.1.1 ([b3f9114](https://github.com/OTSkit/OTSkit-MCP/commit/b3f91141b42fa7cc8516da1a8ec880fc90933cda))
* update test mocks from [@alexalves87](https://github.com/alexalves87) to [@otskit](https://github.com/otskit) package names ([ed1cbe0](https://github.com/OTSkit/OTSkit-MCP/commit/ed1cbe0a6e391f28a1ea1debf90ae69c480fc92d))
* upgrade semantic-release to v25 and add NPM_TOKEN secret ([297a6ca](https://github.com/OTSkit/OTSkit-MCP/commit/297a6ca15960fa21c72976978ef5727bb18ca891))
* use npm registry deps and pnpm in CI ([2f4f2b9](https://github.com/OTSkit/OTSkit-MCP/commit/2f4f2b95beff01fe54b49463770a7f0da6d7ccab))


### Features

* add install-claude command for automatic Claude Desktop setup ([717b9f1](https://github.com/OTSkit/OTSkit-MCP/commit/717b9f176816c8020e7d642867e79b9fa73a162c))
* add setup command for agent config (claude | codex) ([fea7dc8](https://github.com/OTSkit/OTSkit-MCP/commit/fea7dc8f313d613b1555121d4a79e5dc78894f81))
* add watch command for real-time pending stamp polling ([00a96a5](https://github.com/OTSkit/OTSkit-MCP/commit/00a96a51952a5dc2b71fd372629f1b335e2f9b7f))
* initial commit — OTSkit MCP server ([6de8ef4](https://github.com/OTSkit/OTSkit-MCP/commit/6de8ef45d50b803fa951eb77a078aacdc6d31b63))

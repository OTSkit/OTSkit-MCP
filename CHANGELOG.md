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

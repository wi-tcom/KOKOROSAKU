# Third-Party Notices — SAKU Builder 0.1.0-beta.2 Public Preview

This inventory is bound to the public Windows installer whose SHA-256 is
`4b277ead963551ae7f27b60168d72b0a7dfdd2434af39cb256f26917a2eaac63`.
It corrects the earlier statement that the desktop artifact had no third-party runtime dependencies.

## Distribution classifications

- `BUNDLED_COMPONENT`: a separately identifiable binary component is inside the installer.
- `LINKED_DEPENDENCY`: code is linked into `saku-builder-desktop.exe`.
- `BUILD_TIME_ONLY`: used to build the artifact and not shipped as a separate runtime component.
- `SYSTEM_RUNTIME`: supplied by Windows.
- `EXTERNAL_RUNTIME`: obtained or supplied separately at install/run time.
- `NOT_DISTRIBUTED`: present in the lock/tooling universe but not active in this Windows artifact.

A license declaration is not an Authority or warranty. Project links are provided so the corresponding license and copyright notices can be inspected.

## Exact artifact/component boundary

| Name | Version | License | Project/source | Classification | Notice in distribution |
|---|---:|---|---|---|---|
| Rust standard library | 1.97.1 | Apache-2.0 OR MIT | https://github.com/rust-lang/rust | LINKED_DEPENDENCY | YES |
| NSIS core, uninstaller stub, and standard plugins (System, nsDialogs, NSISdl, StartMenu, LangDLL) | 3.11 | zlib/libpng; bzip2; Common Public License 1.0 for the LZMA module | https://nsis.sourceforge.io/Main_Page | BUNDLED_COMPONENT | YES |
| nsis_tauri_utils.dll | Tauri CLI 2.11.4 toolchain | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | BUNDLED_COMPONENT | YES |
| Microsoft Edge WebView2 Bootstrapper | current Microsoft download selected by LinkId 2124703 | Microsoft Software License Terms | https://developer.microsoft.com/microsoft-edge/webview2/ | EXTERNAL_RUNTIME | NO — not bundled; downloaded by installer when needed |
| Microsoft Edge WebView2 Runtime | installed runtime | Microsoft Software License Terms | https://developer.microsoft.com/microsoft-edge/webview2/ | EXTERNAL_RUNTIME | NO — not bundled |
| Microsoft Windows system runtime and APIs | system version | Microsoft Windows terms | https://www.microsoft.com/licensing/terms | SYSTEM_RUNTIME | NO — not bundled |
| @tauri-apps/cli | 2.11.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | BUILD_TIME_ONLY | NO — not distributed |
| Node.js | 24.19.0 | MIT | https://github.com/nodejs/node | BUILD_TIME_ONLY | NO — not distributed |
| npm CLI | 11.17.0 | Artistic-2.0 | https://github.com/npm/cli | BUILD_TIME_ONLY | NO — not distributed |
| rustc and Cargo | 1.97.1 | Apache-2.0 OR MIT | https://github.com/rust-lang/rust | BUILD_TIME_ONLY | NO — not distributed |
| Microsoft Visual C++ Build Tools / MSVC | Visual Studio 18.7.1; MSVC 14.51.36231 | Microsoft terms | https://visualstudio.microsoft.com/license-terms/ | BUILD_TIME_ONLY | NO — not distributed |

The WebView2 Loader code used by the application is represented by the linked
`webview2-com` / `webview2-com-sys` Cargo rows below. The WebView2 Runtime
and the bootstrapper are not embedded in the installer. The NSIS compiler is a
build tool; the resulting NSIS stub, uninstaller, and standard plugin DLLs are
distributed as identified above. WiX is not used by this NSIS-only artifact.

## Cargo inventory method and result

- Lockfile: `src-tauri/Cargo.lock` at source commit `2200704a8b4a7dfe521cda0e42e15cd202ef48cb`.
- Lockfile package entries: 450, including the first-party application package.
- Active third-party packages for `x86_64-pc-windows-msvc`: 264.
- Linked third-party packages: 222.
- Proc-macro/build-time-only packages: 42 (24 proc-macro, 18 other build-time).
- Lockfile third-party packages not active for this target: 185; these are `NOT_DISTRIBUTED`.
- Method: locked, offline Cargo metadata filtered for `x86_64-pc-windows-msvc`, with dev-dependencies excluded and proc-macro targets classified as build-time.

`Cargo.lock` membership alone is not treated as proof that a package is
distributed. Linked rows require a license notice; build-time-only rows are
listed for transparency but are not shipped components.

| Cargo package | Version | Declared license | Project/source | Classification | Notice required |
|---|---:|---|---|---|---|
| autocfg | 1.5.1 | Apache-2.0 OR MIT | https://github.com/cuviper/autocfg | BUILD_TIME_ONLY | NO — not distributed |
| cargo_toml | 0.22.3 | Apache-2.0 OR MIT | https://gitlab.com/lib.rs/cargo_toml | BUILD_TIME_ONLY | NO — not distributed |
| cc | 1.4.4 | MIT OR Apache-2.0 | https://github.com/rust-lang/cc-rs | BUILD_TIME_ONLY | NO — not distributed |
| cssparser-macros | 0.6.1 | MPL-2.0 | https://github.com/servo/rust-cssparser | BUILD_TIME_ONLY | NO — not distributed |
| ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT | https://github.com/mmastrac/rust-ctor | BUILD_TIME_ONLY | NO — not distributed |
| darling_macro | 0.23.0 | MIT | https://github.com/TedDriggs/darling | BUILD_TIME_ONLY | NO — not distributed |
| defmt-macros | 1.1.1 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt | BUILD_TIME_ONLY | NO — not distributed |
| derive_more-impl | 2.1.1 | MIT | https://github.com/JelteF/derive_more | BUILD_TIME_ONLY | NO — not distributed |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 | https://github.com/yaahc/displaydoc | BUILD_TIME_ONLY | NO — not distributed |
| dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT | https://github.com/mmastrac/rust-ctor | BUILD_TIME_ONLY | NO — not distributed |
| embed-resource | 3.0.11 | MIT | https://github.com/nabijaczleweli/rust-embed-resource | BUILD_TIME_ONLY | NO — not distributed |
| find-msvc-tools | 0.1.11 | MIT OR Apache-2.0 | https://github.com/rust-lang/cc-rs | BUILD_TIME_ONLY | NO — not distributed |
| phf_codegen | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf | BUILD_TIME_ONLY | NO — not distributed |
| phf_macros | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf | BUILD_TIME_ONLY | NO — not distributed |
| ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 | https://github.com/dtolnay/ref-cast | BUILD_TIME_ONLY | NO — not distributed |
| rustc_version | 0.4.1 | MIT OR Apache-2.0 | https://github.com/djc/rustc-version-rs | BUILD_TIME_ONLY | NO — not distributed |
| schemars_derive | 0.8.22 | MIT | https://github.com/GREsau/schemars | BUILD_TIME_ONLY | NO — not distributed |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde | BUILD_TIME_ONLY | NO — not distributed |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/serde-repr | BUILD_TIME_ONLY | NO — not distributed |
| serde_with_macros | 3.22.0 | MIT OR Apache-2.0 | https://github.com/jonasbb/serde_with/ | BUILD_TIME_ONLY | NO — not distributed |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 | https://github.com/chippers/serialize-to-javascript | BUILD_TIME_ONLY | NO — not distributed |
| shlex | 2.0.1 | MIT OR Apache-2.0 | https://github.com/comex/rust-shlex | BUILD_TIME_ONLY | NO — not distributed |
| string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 | https://github.com/servo/string-cache | BUILD_TIME_ONLY | NO — not distributed |
| tauri-build | 2.6.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | BUILD_TIME_ONLY | NO — not distributed |
| tauri-macros | 2.6.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | BUILD_TIME_ONLY | NO — not distributed |
| tauri-winres | 0.3.6 | MIT | https://github.com/tauri-apps/winres | BUILD_TIME_ONLY | NO — not distributed |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror | BUILD_TIME_ONLY | NO — not distributed |
| thiserror-impl | 2.0.20 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror | BUILD_TIME_ONLY | NO — not distributed |
| time-macros | 0.2.32 | MIT OR Apache-2.0 | https://github.com/time-rs/time | BUILD_TIME_ONLY | NO — not distributed |
| toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | BUILD_TIME_ONLY | NO — not distributed |
| toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | BUILD_TIME_ONLY | NO — not distributed |
| version_check | 0.9.5 | MIT/Apache-2.0 | https://github.com/SergioBenitez/version_check | BUILD_TIME_ONLY | NO — not distributed |
| vswhom | 0.1.0 | MIT | https://github.com/nabijaczleweli/vswhom.rs | BUILD_TIME_ONLY | NO — not distributed |
| vswhom-sys | 0.1.3 | MIT | https://github.com/nabijaczleweli/vswhom-sys.rs | BUILD_TIME_ONLY | NO — not distributed |
| webview2-com-macros | 0.8.1 | MIT | https://github.com/wravery/webview2-rs | BUILD_TIME_ONLY | NO — not distributed |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | BUILD_TIME_ONLY | NO — not distributed |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | BUILD_TIME_ONLY | NO — not distributed |
| winnow | 0.7.15 | MIT | https://github.com/winnow-rs/winnow | BUILD_TIME_ONLY | NO — not distributed |
| winreg | 0.55.0 | MIT | https://github.com/gentoo90/winreg-rs | BUILD_TIME_ONLY | NO — not distributed |
| yoke-derive | 0.8.2 | Unicode-3.0 | https://github.com/unicode-org/icu4x | BUILD_TIME_ONLY | NO — not distributed |
| zerofrom-derive | 0.1.7 | Unicode-3.0 | https://github.com/unicode-org/icu4x | BUILD_TIME_ONLY | NO — not distributed |
| zerovec-derive | 0.11.6 | Unicode-3.0 | https://github.com/unicode-org/icu4x | BUILD_TIME_ONLY | NO — not distributed |
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | https://github.com/oyvindln/adler2 | LINKED_DEPENDENCY | YES |
| aho-corasick | 1.1.5 | Unlicense OR MIT | https://github.com/BurntSushi/aho-corasick | LINKED_DEPENDENCY | YES |
| alloc-no-stdlib | 2.0.4 | BSD-3-Clause | https://github.com/dropbox/rust-alloc-no-stdlib | LINKED_DEPENDENCY | YES |
| alloc-stdlib | 0.2.4 | BSD-3-Clause | https://github.com/dropbox/rust-alloc-no-stdlib | LINKED_DEPENDENCY | YES |
| anyhow | 1.0.104 | MIT OR Apache-2.0 | https://github.com/dtolnay/anyhow | LINKED_DEPENDENCY | YES |
| base64 | 0.22.1 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 | LINKED_DEPENDENCY | YES |
| bit-set | 0.8.0 | Apache-2.0 OR MIT | https://github.com/contain-rs/bit-set | LINKED_DEPENDENCY | YES |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT | https://github.com/contain-rs/bit-vec | LINKED_DEPENDENCY | YES |
| bitflags | 1.3.2 | MIT/Apache-2.0 | https://github.com/bitflags/bitflags | LINKED_DEPENDENCY | YES |
| bitflags | 2.13.1 | MIT OR Apache-2.0 | https://github.com/bitflags/bitflags | LINKED_DEPENDENCY | YES |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils | LINKED_DEPENDENCY | YES |
| block-buffer | 0.12.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils | LINKED_DEPENDENCY | YES |
| brotli | 8.0.4 | BSD-3-Clause AND MIT | https://github.com/dropbox/rust-brotli | LINKED_DEPENDENCY | YES |
| brotli-decompressor | 5.0.3 | BSD-3-Clause/MIT | https://github.com/dropbox/rust-brotli-decompressor | LINKED_DEPENDENCY | YES |
| bs58 | 0.5.1 | MIT/Apache-2.0 | https://github.com/Nullus157/bs58-rs | LINKED_DEPENDENCY | YES |
| byteorder | 1.5.0 | Unlicense OR MIT | https://github.com/BurntSushi/byteorder | LINKED_DEPENDENCY | YES |
| bytes | 1.12.1 | MIT | https://github.com/tokio-rs/bytes | LINKED_DEPENDENCY | YES |
| camino | 1.2.5 | MIT OR Apache-2.0 | https://github.com/camino-rs/camino | LINKED_DEPENDENCY | YES |
| cargo_metadata | 0.19.2 | MIT | https://github.com/oli-obk/cargo_metadata | LINKED_DEPENDENCY | YES |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 | https://github.com/rust-lang/cargo | LINKED_DEPENDENCY | YES |
| cfb | 0.7.3 | MIT | https://github.com/mdsteele/rust-cfb | LINKED_DEPENDENCY | YES |
| cfg-if | 1.0.4 | MIT OR Apache-2.0 | https://github.com/rust-lang/cfg-if | LINKED_DEPENDENCY | YES |
| chrono | 0.4.45 | MIT OR Apache-2.0 | https://github.com/chronotope/chrono | LINKED_DEPENDENCY | YES |
| const-oid | 0.10.2 | Apache-2.0 OR MIT | https://github.com/RustCrypto/formats | LINKED_DEPENDENCY | YES |
| cookie | 0.18.2 | MIT OR Apache-2.0 | https://github.com/SergioBenitez/cookie-rs | LINKED_DEPENDENCY | YES |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils | LINKED_DEPENDENCY | YES |
| cpufeatures | 0.3.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils | LINKED_DEPENDENCY | YES |
| crc32fast | 1.5.1 | MIT OR Apache-2.0 | https://github.com/srijs/rust-crc32fast | LINKED_DEPENDENCY | YES |
| crossbeam-channel | 0.5.16 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam | LINKED_DEPENDENCY | YES |
| crossbeam-utils | 0.8.22 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam | LINKED_DEPENDENCY | YES |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits | LINKED_DEPENDENCY | YES |
| crypto-common | 0.2.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits | LINKED_DEPENDENCY | YES |
| cssparser | 0.36.0 | MPL-2.0 | https://github.com/servo/rust-cssparser | LINKED_DEPENDENCY | YES |
| ctor | 0.8.0 | Apache-2.0 OR MIT | https://github.com/mmastrac/rust-ctor | LINKED_DEPENDENCY | YES |
| darling | 0.23.0 | MIT | https://github.com/TedDriggs/darling | LINKED_DEPENDENCY | YES |
| darling_core | 0.23.0 | MIT | https://github.com/TedDriggs/darling | LINKED_DEPENDENCY | YES |
| defmt | 1.1.1 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt | LINKED_DEPENDENCY | YES |
| defmt-parser | 1.0.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt | LINKED_DEPENDENCY | YES |
| deranged | 0.5.8 | MIT OR Apache-2.0 | https://github.com/jhpratt/deranged | LINKED_DEPENDENCY | YES |
| derive_more | 2.1.1 | MIT | https://github.com/JelteF/derive_more | LINKED_DEPENDENCY | YES |
| digest | 0.10.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits | LINKED_DEPENDENCY | YES |
| digest | 0.11.3 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits | LINKED_DEPENDENCY | YES |
| dirs | 6.0.0 | MIT OR Apache-2.0 | https://github.com/soc/dirs-rs | LINKED_DEPENDENCY | YES |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 | https://github.com/dirs-dev/dirs-sys-rs | LINKED_DEPENDENCY | YES |
| dom_query | 0.27.0 | MIT | https://github.com/niklak/dom_query | LINKED_DEPENDENCY | YES |
| dpi | 0.1.2 | Apache-2.0 AND MIT | https://github.com/rust-windowing/winit | LINKED_DEPENDENCY | YES |
| dtoa | 1.0.11 | MIT OR Apache-2.0 | https://github.com/dtolnay/dtoa | LINKED_DEPENDENCY | YES |
| dtoa-short | 0.3.5 | MPL-2.0 | https://github.com/upsuper/dtoa-short | LINKED_DEPENDENCY | YES |
| dtor | 0.3.0 | Apache-2.0 OR MIT | https://github.com/mmastrac/rust-ctor | LINKED_DEPENDENCY | YES |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | https://gitlab.com/kornelski/dunce | LINKED_DEPENDENCY | YES |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 | https://github.com/dtolnay/dyn-clone | LINKED_DEPENDENCY | YES |
| equivalent | 1.0.2 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/equivalent | LINKED_DEPENDENCY | YES |
| erased-serde | 0.4.10 | MIT OR Apache-2.0 | https://github.com/dtolnay/erased-serde | LINKED_DEPENDENCY | YES |
| fastrand | 2.5.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/fastrand | LINKED_DEPENDENCY | YES |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 | https://github.com/image-rs/fdeflate | LINKED_DEPENDENCY | YES |
| flate2 | 1.1.9 | MIT OR Apache-2.0 | https://github.com/rust-lang/flate2-rs | LINKED_DEPENDENCY | YES |
| fnv | 1.0.7 | Apache-2.0 / MIT | https://github.com/servo/rust-fnv | LINKED_DEPENDENCY | YES |
| foldhash | 0.2.0 | Zlib | https://github.com/orlp/foldhash | LINKED_DEPENDENCY | YES |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url | LINKED_DEPENDENCY | YES |
| generic-array | 0.14.7 | MIT | https://github.com/fizyk20/generic-array.git | LINKED_DEPENDENCY | YES |
| getrandom | 0.3.4 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom | LINKED_DEPENDENCY | YES |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom | LINKED_DEPENDENCY | YES |
| glob | 0.3.4 | MIT OR Apache-2.0 | https://github.com/rust-lang/glob | LINKED_DEPENDENCY | YES |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown | LINKED_DEPENDENCY | YES |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown | LINKED_DEPENDENCY | YES |
| heck | 0.5.0 | MIT OR Apache-2.0 | https://github.com/withoutboats/heck | LINKED_DEPENDENCY | YES |
| hex | 0.4.3 | MIT OR Apache-2.0 | https://github.com/KokaKiwi/rust-hex | LINKED_DEPENDENCY | YES |
| html5ever | 0.38.0 | MIT OR Apache-2.0 | https://github.com/servo/html5ever | LINKED_DEPENDENCY | YES |
| http | 1.5.0 | MIT OR Apache-2.0 | https://github.com/hyperium/http | LINKED_DEPENDENCY | YES |
| hybrid-array | 0.4.14 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hybrid-array | LINKED_DEPENDENCY | YES |
| ico | 0.5.0 | MIT | https://github.com/mdsteele/rust-ico | LINKED_DEPENDENCY | YES |
| icu_collections | 2.3.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| icu_locale_core | 2.3.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| icu_normalizer | 2.3.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| icu_normalizer_data | 2.3.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| icu_properties | 2.3.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| icu_properties_data | 2.3.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| icu_provider | 2.3.1 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| ident_case | 1.0.1 | MIT/Apache-2.0 | https://github.com/TedDriggs/ident_case | LINKED_DEPENDENCY | YES |
| idna | 1.1.0 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ | LINKED_DEPENDENCY | YES |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT | https://github.com/hsivonen/idna_adapter | LINKED_DEPENDENCY | YES |
| indexmap | 1.9.3 | Apache-2.0 OR MIT | https://github.com/bluss/indexmap | LINKED_DEPENDENCY | YES |
| indexmap | 2.14.0 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/indexmap | LINKED_DEPENDENCY | YES |
| infer | 0.19.0 | MIT | https://github.com/bojand/infer | LINKED_DEPENDENCY | YES |
| itoa | 1.0.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/itoa | LINKED_DEPENDENCY | YES |
| jiff | 0.2.35 | Unlicense OR MIT | https://github.com/BurntSushi/jiff | LINKED_DEPENDENCY | YES |
| jiff-core | 0.1.0 | Unlicense OR MIT | https://github.com/BurntSushi/jiff | LINKED_DEPENDENCY | YES |
| jiff-tzdb | 0.1.8 | Unlicense OR MIT | https://github.com/BurntSushi/jiff | LINKED_DEPENDENCY | YES |
| jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT | https://github.com/BurntSushi/jiff | LINKED_DEPENDENCY | YES |
| json-patch | 3.0.1 | MIT/Apache-2.0 | https://github.com/idubrov/json-patch | LINKED_DEPENDENCY | YES |
| jsonptr | 0.6.3 | MIT OR Apache-2.0 | https://github.com/chanced/jsonptr | LINKED_DEPENDENCY | YES |
| keyboard-types | 0.7.0 | MIT OR Apache-2.0 | https://github.com/pyfisch/keyboard-types | LINKED_DEPENDENCY | YES |
| libc | 0.2.189 | MIT OR Apache-2.0 | https://github.com/rust-lang/libc | LINKED_DEPENDENCY | YES |
| litemap | 0.8.3 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| lock_api | 0.4.14 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot | LINKED_DEPENDENCY | YES |
| log | 0.4.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/log | LINKED_DEPENDENCY | YES |
| markup5ever | 0.38.0 | MIT OR Apache-2.0 | https://github.com/servo/html5ever | LINKED_DEPENDENCY | YES |
| memchr | 2.8.3 | Unlicense OR MIT | https://github.com/BurntSushi/memchr | LINKED_DEPENDENCY | YES |
| mime | 0.3.17 | MIT OR Apache-2.0 | https://github.com/hyperium/mime | LINKED_DEPENDENCY | YES |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide | LINKED_DEPENDENCY | YES |
| mio | 1.2.2 | MIT | https://github.com/tokio-rs/mio | LINKED_DEPENDENCY | YES |
| muda | 0.19.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/muda | LINKED_DEPENDENCY | YES |
| new_debug_unreachable | 1.0.6 | MIT | https://github.com/mbrubeck/rust-debug-unreachable | LINKED_DEPENDENCY | YES |
| num-conv | 0.2.2 | MIT OR Apache-2.0 | https://github.com/jhpratt/num-conv | LINKED_DEPENDENCY | YES |
| num-traits | 0.2.19 | MIT OR Apache-2.0 | https://github.com/rust-num/num-traits | LINKED_DEPENDENCY | YES |
| once_cell | 1.21.4 | MIT OR Apache-2.0 | https://github.com/matklad/once_cell | LINKED_DEPENDENCY | YES |
| option-ext | 0.2.0 | MPL-2.0 | https://github.com/soc/option-ext.git | LINKED_DEPENDENCY | YES |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot | LINKED_DEPENDENCY | YES |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot | LINKED_DEPENDENCY | YES |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ | LINKED_DEPENDENCY | YES |
| phf | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf | LINKED_DEPENDENCY | YES |
| phf_generator | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf | LINKED_DEPENDENCY | YES |
| phf_shared | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf | LINKED_DEPENDENCY | YES |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT | https://github.com/taiki-e/pin-project-lite | LINKED_DEPENDENCY | YES |
| plist | 1.10.0 | MIT | https://github.com/ebarnard/rust-plist/ | LINKED_DEPENDENCY | YES |
| png | 0.17.16 | MIT OR Apache-2.0 | https://github.com/image-rs/image-png | LINKED_DEPENDENCY | YES |
| potential_utf | 0.1.6 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| powerfmt | 0.2.0 | MIT OR Apache-2.0 | https://github.com/jhpratt/powerfmt | LINKED_DEPENDENCY | YES |
| precomputed-hash | 0.1.1 | MIT | https://github.com/emilio/precomputed-hash | LINKED_DEPENDENCY | YES |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | https://github.com/dtolnay/proc-macro2 | LINKED_DEPENDENCY | YES |
| quick-xml | 0.41.0 | MIT | https://github.com/tafia/quick-xml | LINKED_DEPENDENCY | YES |
| quote | 1.0.47 | MIT OR Apache-2.0 | https://github.com/dtolnay/quote | LINKED_DEPENDENCY | YES |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib | https://github.com/rust-windowing/raw-window-handle | LINKED_DEPENDENCY | YES |
| ref-cast | 1.0.27 | MIT OR Apache-2.0 | https://github.com/dtolnay/ref-cast | LINKED_DEPENDENCY | YES |
| regex | 1.13.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex | LINKED_DEPENDENCY | YES |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex | LINKED_DEPENDENCY | YES |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex | LINKED_DEPENDENCY | YES |
| rfd | 0.17.2 | MIT | https://github.com/PolyMeilex/rfd | LINKED_DEPENDENCY | YES |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT | https://github.com/rust-lang/rustc-hash | LINKED_DEPENDENCY | YES |
| same-file | 1.0.6 | Unlicense/MIT | https://github.com/BurntSushi/same-file | LINKED_DEPENDENCY | YES |
| schemars | 0.8.22 | MIT | https://github.com/GREsau/schemars | LINKED_DEPENDENCY | YES |
| schemars | 0.9.0 | MIT | https://github.com/GREsau/schemars | LINKED_DEPENDENCY | YES |
| schemars | 1.2.2 | MIT | https://github.com/GREsau/schemars | LINKED_DEPENDENCY | YES |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 | https://github.com/bluss/scopeguard | LINKED_DEPENDENCY | YES |
| selectors | 0.36.1 | MPL-2.0 | https://github.com/servo/stylo | LINKED_DEPENDENCY | YES |
| semver | 1.0.28 | MIT OR Apache-2.0 | https://github.com/dtolnay/semver | LINKED_DEPENDENCY | YES |
| serde | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde | LINKED_DEPENDENCY | YES |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde | LINKED_DEPENDENCY | YES |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde | LINKED_DEPENDENCY | YES |
| serde_json | 1.0.151 | MIT OR Apache-2.0 | https://github.com/serde-rs/json | LINKED_DEPENDENCY | YES |
| serde_spanned | 1.1.1 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | LINKED_DEPENDENCY | YES |
| serde_with | 3.22.0 | MIT OR Apache-2.0 | https://github.com/jonasbb/serde_with/ | LINKED_DEPENDENCY | YES |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 | https://github.com/dtolnay/serde-untagged | LINKED_DEPENDENCY | YES |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 | https://github.com/chippers/serialize-to-javascript | LINKED_DEPENDENCY | YES |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 | https://github.com/servo/stylo | LINKED_DEPENDENCY | YES |
| sha2 | 0.10.9 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes | LINKED_DEPENDENCY | YES |
| sha2 | 0.11.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes | LINKED_DEPENDENCY | YES |
| simd-adler32 | 0.3.10 | MIT | https://github.com/mcountryman/simd-adler32 | LINKED_DEPENDENCY | YES |
| siphasher | 1.0.3 | MIT/Apache-2.0 | https://github.com/jedisct1/rust-siphash | LINKED_DEPENDENCY | YES |
| smallvec | 1.15.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-smallvec | LINKED_DEPENDENCY | YES |
| socket2 | 0.6.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/socket2 | LINKED_DEPENDENCY | YES |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 | https://github.com/rust-windowing/softbuffer | LINKED_DEPENDENCY | YES |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | https://github.com/storyyeller/stable_deref_trait | LINKED_DEPENDENCY | YES |
| string_cache | 0.9.0 | MIT OR Apache-2.0 | https://github.com/servo/string-cache | LINKED_DEPENDENCY | YES |
| strsim | 0.11.1 | MIT | https://github.com/rapidfuzz/strsim-rs | LINKED_DEPENDENCY | YES |
| syn | 2.0.119 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn | LINKED_DEPENDENCY | YES |
| syn | 3.0.4 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn | LINKED_DEPENDENCY | YES |
| synstructure | 0.13.2 | MIT | https://github.com/mystor/synstructure | LINKED_DEPENDENCY | YES |
| tao | 0.35.3 | Apache-2.0 | https://github.com/tauri-apps/tao | LINKED_DEPENDENCY | YES |
| tauri | 2.11.5 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | LINKED_DEPENDENCY | YES |
| tauri-codegen | 2.6.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | LINKED_DEPENDENCY | YES |
| tauri-runtime | 2.11.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | LINKED_DEPENDENCY | YES |
| tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | LINKED_DEPENDENCY | YES |
| tauri-utils | 2.9.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri | LINKED_DEPENDENCY | YES |
| tendril | 0.5.1 | MIT OR Apache-2.0 | https://github.com/servo/html5ever | LINKED_DEPENDENCY | YES |
| thiserror | 1.0.69 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror | LINKED_DEPENDENCY | YES |
| thiserror | 2.0.20 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror | LINKED_DEPENDENCY | YES |
| time | 0.3.55 | MIT OR Apache-2.0 | https://github.com/time-rs/time | LINKED_DEPENDENCY | YES |
| time-core | 0.1.9 | MIT OR Apache-2.0 | https://github.com/time-rs/time | LINKED_DEPENDENCY | YES |
| tinystr | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| tinyvec | 1.12.0 | Zlib OR Apache-2.0 OR MIT | https://github.com/Lokathor/tinyvec | LINKED_DEPENDENCY | YES |
| tinyvec_macros | 0.1.1 | MIT OR Apache-2.0 OR Zlib | https://github.com/Soveu/tinyvec_macros | LINKED_DEPENDENCY | YES |
| tokio | 1.53.1 | MIT | https://github.com/tokio-rs/tokio | LINKED_DEPENDENCY | YES |
| toml | 1.1.4+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | LINKED_DEPENDENCY | YES |
| toml_datetime | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | LINKED_DEPENDENCY | YES |
| toml_parser | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | LINKED_DEPENDENCY | YES |
| toml_writer | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml | LINKED_DEPENDENCY | YES |
| tracing | 0.1.44 | MIT | https://github.com/tokio-rs/tracing | LINKED_DEPENDENCY | YES |
| tracing-core | 0.1.36 | MIT | https://github.com/tokio-rs/tracing | LINKED_DEPENDENCY | YES |
| tray-icon | 0.24.2 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tray-icon | LINKED_DEPENDENCY | YES |
| typeid | 1.0.3 | MIT OR Apache-2.0 | https://github.com/dtolnay/typeid | LINKED_DEPENDENCY | YES |
| typenum | 1.20.1 | MIT OR Apache-2.0 | https://github.com/paholg/typenum | LINKED_DEPENDENCY | YES |
| unic-char-property | 0.9.0 | MIT/Apache-2.0 | https://github.com/open-i18n/rust-unic/ | LINKED_DEPENDENCY | YES |
| unic-char-range | 0.9.0 | MIT/Apache-2.0 | https://github.com/open-i18n/rust-unic/ | LINKED_DEPENDENCY | YES |
| unic-common | 0.9.0 | MIT/Apache-2.0 | https://github.com/open-i18n/rust-unic/ | LINKED_DEPENDENCY | YES |
| unic-ucd-ident | 0.9.0 | MIT/Apache-2.0 | https://github.com/open-i18n/rust-unic/ | LINKED_DEPENDENCY | YES |
| unic-ucd-version | 0.9.0 | MIT/Apache-2.0 | https://github.com/open-i18n/rust-unic/ | LINKED_DEPENDENCY | YES |
| unicode-ident | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | https://github.com/dtolnay/unicode-ident | LINKED_DEPENDENCY | YES |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 | https://github.com/unicode-rs/unicode-segmentation | LINKED_DEPENDENCY | YES |
| url | 2.5.8 | MIT OR Apache-2.0 | https://github.com/servo/rust-url | LINKED_DEPENDENCY | YES |
| urlpattern | 0.3.0 | MIT | https://github.com/denoland/rust-urlpattern | LINKED_DEPENDENCY | YES |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT | https://github.com/hsivonen/utf8_iter | LINKED_DEPENDENCY | YES |
| uuid | 1.25.0 | Apache-2.0 OR MIT | https://github.com/uuid-rs/uuid | LINKED_DEPENDENCY | YES |
| walkdir | 2.5.0 | Unlicense/MIT | https://github.com/BurntSushi/walkdir | LINKED_DEPENDENCY | YES |
| web_atoms | 0.2.6 | MIT OR Apache-2.0 | https://github.com/servo/html5ever | LINKED_DEPENDENCY | YES |
| webview2-com | 0.38.2 | MIT | https://github.com/wravery/webview2-rs | LINKED_DEPENDENCY | YES |
| webview2-com-sys | 0.38.2 | MIT | https://github.com/wravery/webview2-rs | LINKED_DEPENDENCY | YES |
| winapi-util | 0.1.11 | Unlicense OR MIT | https://github.com/BurntSushi/winapi-util | LINKED_DEPENDENCY | YES |
| window-vibrancy | 0.6.0 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri-plugin-vibrancy | LINKED_DEPENDENCY | YES |
| windows | 0.61.3 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-collections | 0.2.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-core | 0.61.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-future | 0.2.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-link | 0.1.3 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-link | 0.2.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-numerics | 0.2.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-result | 0.3.4 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-strings | 0.4.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-sys | 0.59.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-threading | 0.1.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| windows-version | 0.1.7 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs | LINKED_DEPENDENCY | YES |
| winnow | 1.0.4 | MIT | https://github.com/winnow-rs/winnow | LINKED_DEPENDENCY | YES |
| writeable | 0.6.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| wry | 0.55.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/wry | LINKED_DEPENDENCY | YES |
| yoke | 0.8.3 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| zerofrom | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| zerotrie | 0.2.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| zerovec | 0.11.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x | LINKED_DEPENDENCY | YES |
| zmij | 1.0.23 | MIT | https://github.com/dtolnay/zmij | LINKED_DEPENDENCY | YES |

## Notice coverage

For this exact artifact, the conservative notice-required count is **225**:
222 linked Cargo packages, the Rust standard library, the NSIS component family,
and `nsis_tauri_utils.dll`. Build-time-only, system, external-runtime, and
not-distributed entries are disclosed but are not claimed to be bundled.

## Distributed license and notice evidence

The public distribution includes `third-party/THIRD_PARTY_LICENSE_MANIFEST.json`.
It maps all 225 notice-required components to byte-preserved upstream license
evidence under `third-party/LICENSES/` and, where present, upstream copyright or
notice evidence under `third-party/NOTICES/`.

Cargo rows map by `cargo:<package>@<version>`. The three non-Cargo entries map by
their explicit Rust, NSIS, or Tauri component IDs. No separate upstream `NOTICE`
file was present in the exact linked Cargo package set; this is recorded per
component rather than inferred as a missing file. Package authors metadata is
preserved where a separate upstream copyright file is absent and is not
represented as a copyright-holder assertion.

This file and the manifest record declared license expressions, distribution relationships, source evidence, and distributed license/notice references. They are not legal advice.

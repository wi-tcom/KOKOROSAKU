# SAKU brand asset rebind evidence

Owner-authorized source: `wi-tcom/site-content@a3c24a1`, path `brand/logo/saku`.

Provenance: Owner-directed vector artwork (hand-defined SVG, rasterized with Chrome; no generative image model)

License: CC-BY-4.0, 著作権が及ぶ範囲において. Rights holder: 株式会社wi-t.com. Trademark rights are not granted.

## Authoritative inputs

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| `saku-1024.png` | 31,854 | `854a6d39ee28e8cacd2d8b8ca881875c62d72cdae6d649851897cc24431cba0c` |
| `saku.svg` | 341 | `e1a72c0bcec0653c27eaf07afeaac27274c2f8dc2b9cfee0fc3eb8d043894403` |
| `saku-favicon.ico` | 5,884 | `52769ad1e2b7916cfb8d3800d362da8570016a20c6d0f3b653ee5140049e59b1` |

## Tauri icon inventory

The after set was generated from the exact `saku-1024.png` with Tauri CLI 2 (`tauri icon`) in a temporary directory. Only the seven configured desktop targets were copied into the repository.

| Target | Before bytes | Before SHA-256 | After bytes | After SHA-256 |
| --- | ---: | --- | ---: | --- |
| `32x32.png` | 771 | `c5e0978f59afa6d8e01bd228a9c55ea5fda8c8d1df1de678b442ef439002ebc0` | 1,064 | `0ae130a5cc5234411f33cda0cdc92a3a03adec4a54cdb847a46332f4aa7c0d45` |
| `64x64.png` | 1,473 | `bf2385ae0ea6fba635214ae623e95b6811fc9bd6db3da2e2672424e79e5f8541` | 2,591 | `e4db553f8b8a2b6aaa0714d9fe3a09d591ead2d7ad0d1ef039699d098ed15b51` |
| `128x128.png` | 2,841 | `89503c8d464b917fdf90dc228ea6f3d3e7dc66363fe59cd83be1d0042f2abc5d` | 5,628 | `23bd748a2f58532e6f06c474b6437e428400e071e1033eae8d4b56ff5b585ba6` |
| `128x128@2x.png` | 5,420 | `65029e09f15658ad8ebc9902b5bee3d7bf804bf4c4b7b1cdfcd575f4b4021957` | 11,456 | `04a043ba1e5c635a64178faa1c1972b53c949c29280ff2452e28f316ce696ba3` |
| `icon.ico` | 11,957 | `265c80b553511cfc0b756cd714453f8732ec5f9d9b7997613c3c0a3b972dffb0` | 19,161 | `4c4b92e70e89070bddfc0574b3e861d11ec8a6b27ce882b47f0beb8e2ee278db` |
| `icon.icns` | 66,029 | `f0e5d979b878293baf6a8927f822d8cd488bb2b94a338aea05795a5b6f0d21f8` | 117,613 | `a2a307d14ae6fcff891beb641dc54f299ea437b0864c37d5b6ad153ee1cc52dd` |
| `icon.png` | 11,279 | `f03233a4c3992cca7efb0539bb776014359fc38bd35f4274faeefb06c61c3a43` | 24,386 | `ba3034896bda39de057be49ed48bcffd4ebdc70103022c55c7617d2bc459af5f` |

The source is 1024×1024 RGBA; generated `icon.png` is 512×512 RGBA. Pixel comparison against a second Tauri generation from the authoritative input was exact (`difference bounding box = none`).

`desktop/icon.svg` is byte-identical to `saku.svg`. Static `favicon.ico` is byte-identical to `saku-favicon.ico`. The Static Builder browser requested `/tooling/builder/favicon.ico` and received HTTP 200.

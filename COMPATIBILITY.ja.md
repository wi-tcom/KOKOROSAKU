# 互換性

> **翻訳について:** この文書は [English COMPATIBILITY](COMPATIBILITY.md) の日本語訳です。英語版が正本であり、内容が異なる場合は英語版が優先されます。

| 役割 | exact identity | 境界 |
|---|---|---|
| Canonical public source | wi-tcom/-SAKU-1-7-Character-System@0f9a0592287a14ea9dd6aa00ae18da8e8e6d3449 | `SAKU_UNIFIED_SCHEMA_V1`の唯一のactive Character Schema |
| Active Schema | sha256:48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817 | exact bytesが必須 |
| Character Extension Contract | sha256:2069021745e9ad98afc84e7dacdb0404c0993f3fcad4147590059764b3170b1b | resolverに必要な同梱contract |
| Builder public source | wi-tcom/-SAKU-builder@abd7292c222b99e6b9648e9bdc8c2860d0b20117 | Authoring / Review Candidate。Canonical Authorityではない |

未知または非対応のversionはfail closedとし、暗黙のmigrationは行いません。Portabilityは検証対象であり、無制限の互換性保証ではありません。


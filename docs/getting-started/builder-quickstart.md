# Builder Quickstart — SampleからCandidateを作る

> `PRE_PUBLICATION_CANDIDATE / NOT_PUBLISHED`

この手順は、最初の操作を小さく安全に確認するためのものです。既定の例は`sample-general-compass`です。

## 1. Open Sample

`samples/oss-launch/v1/sample-characters.json`にある3つのsynthetic OSS Sampleから1つを開きます。実在人物の情報、顧客情報、Credential、秘密情報を入力しないでください。

## 2. Change name / purpose

Character名と目的を自分の用途に合わせて変更します。この操作はCanonicalを変更しません。

## 3. Preview

人向け表示、意図しない説明、AuthorityやHuman Approvalを誤認させる表現がないか確認します。

## 4. Validate

structural validationとsemantic validationを別々に確認します。次の状態が残る場合はexportしません。

```text
FAIL
UNKNOWN
UNSUPPORTED
NOT_CONFIGURED
EXTERNAL_EVIDENCE_REQUIRED
```

`structurally valid != semantic PASS != execution authorization`です。

## 5. Export Candidate

出力は`CANDIDATE / CANONICAL=NO`です。Canonical、Human Approval、Authority、公開済み成果物ではありません。元のSample／Canonical bytesは上書きしません。

## License and data boundary

- exact three Sample Character data: `CC0-1.0`
- this Quickstart document: `CC BY 4.0`, exact publication-manifest path only
- KOKOROSAKU／SAKU trademark rights: not granted

exact three Sample以外のCharacter packは、このQuickstart、Sample selector、download archiveに含まれません。

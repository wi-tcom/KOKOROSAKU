/* roots.mjs — クライアントに焼き込むルート公開鍵（自動生成。手で編集しない）
 * これは trust bundle の署名を検証するための唯一の起点である。
 * bundle から取得しない。取得したら起点にならない。
 * 差し替えはクライアントの再配布を伴う（それが正しい重さである）。
 */
export const ROOT_KEYS = [
  {
    "key_id": "root-2026a",
    "alg": "ES256",
    "public_key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYvIJQZGMVG2gm6jhGpuykmNJgFYiJ3UMjQi2S2nVThqvUwp1VGNeyPdqsvd7RUKH26oJi9SltS25Y16dxB53Ig",
    "state": "retired",
    "retired_at": "2026-08-11T23:59:00+09:00"
  },
  {
    "key_id": "root-usb-1",
    "alg": "ES256",
    "public_key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEToHoM-6kdIVBgE3XdxsPtBtIsA9m_vin4uTp6deme0CYU5V_Iw-9LUANuYNskJwUhybm6q_w-0aXA_LxnHKaIg",
    "state": "active"
  }
];

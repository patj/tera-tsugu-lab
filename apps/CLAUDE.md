# お寺のアプリ（apps/）を作るときのルール

このディレクトリには「お寺のアプリ」を置く。住職（またはお寺の人）が「欲しい」と思った機能（日記、占い、写経の記録など）を、1 つのアプリ = 1 つのディレクトリ（`apps/<app-id>/`）で作る。
人向けの手順書は [docs/apps-guide.md](../docs/apps-guide.md)、仕様は [docs/spec.md](../docs/spec.md) §7。

アプリの利用者は匿名で、データ（文書）は本人のもの。利用者が「お寺と共有する」を選んだアプリのデータだけを、スタッフが読める。
保存、暗号化、共有の履歴、監査ログ、AI の呼び出し（キー、同意、上限）は本体（基盤）が受け持つ。アプリの側では、次のルールを必ず守る。

## 絶対に守ること

1. **データは `useAppStorage` だけで読み書きする**。DB、ファイル、cookie、`localStorage` などに触らない
2. **import できるのは `@/apps-sdk`、`react`、`zod`、自分のディレクトリの中のファイル（と `*.module.css`）だけ**。`@/db`、`@/domain`、`@/lib`、`next/*`、`node:*`、npm のパッケージは使わない
3. **外部と直接通信しない**。`fetch`、`XMLHttpRequest`、`WebSocket`、外部の URL（画像、フォント、リンクを含む）を使わない。AI は `useAppAI`、素材は `useAppAssets` を使う
4. `process.env`、`eval`、`"use server"`、`dangerouslySetInnerHTML`、`<script>`、`<iframe>` を使わない
5. **共有をオンにする前に、何が共有されるかを本人に説明する**（お寺の方が読めるようになる、これまでの分も含む、読むだけ、いつでもやめられる）。説明なしに `share()` を呼ばない。画面を開いただけで共有したり、ほかの操作に紛れて共有したりしない
6. **AI の指示（`instructions`）に、利用者の入力を混ぜない**。利用者の入力は `run()` の `text` と `images` で渡す。AI が失敗しても、アプリが止まらないようにする（下の「AI」）
7. **本体（`src/` など）のファイルは変えない**。基盤に足りない機能があれば、無理をせず、その旨を伝える
8. 作ったら、必ず `npm run apps:gen` と `npm run apps:check` を流し、違反を 0 にする

`apps:check` は正規表現のチェックなので、悪意のある書き方までは見抜けない。公開の前に、人がコードを読む。

## ファイルの構成

`apps/_template/` をコピーして作る（`_` で始まるディレクトリは一覧に載らない）。

| ファイル | 内容 |
|---|---|
| `manifest.ts` | `export const manifest = defineAppManifest({...})`。`id` はディレクトリの名前と同じ（英小文字・数字・`-`。`api` は使えない）。下の「manifest」 |
| `App.tsx` | 利用者の画面。先頭に `"use client"`。`export default function App({ manifest }: AppProps)` |
| `Admin.tsx` | スタッフの画面（`sharing: true` のときは必須）。`export default function Admin({ manifest, docs, nickname }: AppAdminProps<T>)`。表示するだけ（読むだけ） |
| `ai.ts` | AI の仕事の宣言（AI を使うときだけ）。`export const ai = defineAppAI({...})`。**サーバーで読み込まれる**ので、import できるのは `zod` と `@/apps-sdk` だけ |
| `assets/` | 画像や音などの素材（使うときだけ）。下の「素材」 |
| `*.module.css` | アプリ専用の CSS（使うときだけ）。Tailwind のクラスも使える |
| `types.ts` など | 文書の data の型や、画面の部品。自由に足してよい |
| `README.md` | 目的、だれ向けか、文書の形、画面の説明、共有や AI を使うか |

## manifest

```ts
import { defineAppManifest } from "@/apps-sdk";

export const manifest = defineAppManifest({
  id: "heart-closet",
  name: "心のクローゼット",
  description: "その日の気持ちを服にして、脱いで仕舞う日記です。",
  icon: "👗",
  sharing: false,                 // お寺との共有を使うか（true なら Admin.tsx が必要）
  display: "fullscreen",          // 省略すると "framed"（お寺の画面の中）
  pwa: { themeColor: "#FBF6EE", backgroundColor: "#FBF6EE", icon: "icon-512.png" }, // ホーム画面に追加したとき（icon は assets/ の 512×512 の PNG）
  storage: { maxDocs: 5000 },     // 文書の件数の上限（1〜10,000。省略すると 1,000）
  ai: {                           // AI を使うとき（同意の画面に出る）
    purpose: "日記から、その日の服を仕立てるため",
    sends: ["日記の文字", "気分スタンプ", "服の写真（写真から作るとき）"],
    model: "claude-sonnet-5-5",   // claude-opus-5-5（省略時）/ claude-sonnet-5-5 / claude-haiku-5-5
    dailyLimit: 20,               // 利用者ごとの 1 日の回数（1〜100）
  },
});
```

## 画面の出し方

- `display: "framed"`（省略時）: お寺の画面の中に出る。上に帯（アプリの名前、共有の状態と設定、AI の同意）が出る
- `display: "fullscreen"`: アプリが画面全体を使う。背景、画面の流れ、フォントはアプリが決めてよい。基盤は**右上に小さなボタンを 1 つだけ**出す（アプリの一覧へ、共有の状態と設定、AI の同意の設定）。**右上の 48px 四方はあけておく**
- ホーム画面に追加して使うアプリは `pwa` を書く。iPhone では、ホーム画面のアプリと Safari とで利用者が分かれる（基盤の「引き継ぎコード」で移せる。それまでは、ホーム画面に追加してから始めるよう、アプリの中でも案内するとよい）

## `@/apps-sdk`

### 保存

```tsx
"use client";
import { useAppStorage, type AppProps } from "@/apps-sdk";

type Entry = { date: string; text: string };

export default function App({ manifest }: AppProps) {
  const { docs, create, update, remove, removeAll, pending, error } = useAppStorage<Entry>();
  // docs: 自分の文書（新しい順）。{ id, createdAt, updatedAt, data: Entry }
  // create(data) / update(id, data): 成功すると文書、失敗すると null（error に理由が入る）
  // remove(id) / removeAll(): 成功すると true（元に戻せない）
}
```

- 文書の data は、JSON にできる値なら何でもよい（オブジェクト、配列、文字列など）。形はアプリが決め、`types.ts` に型を書く
- 1 件は 100 KB まで。件数は manifest の `storage.maxDocs`（初期値 1,000、最大 10,000）
- アプリの画面を開くときに、自分の文書をすべて読み込む。写真を文書に入れるときは、小さく縮めてから入れる（例: 長辺 240px の JPEG）。1 件を小さく保つほど、開くのが速い
- `createdAt` / `updatedAt` は ISO 8601 の文字列。表示は `new Date(d.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })` のように、必ず `timeZone` を付ける（サーバーとブラウザで表示が食い違わないように）
- 利用者ごとの設定（並び順の好み、選んだアバターなど）も、文書として保存してよい（例: `data: { kind: "settings", ... }`）
- 「データを書き出す」は、`docs` を JSON にして `Blob` と `<a download>` で保存すればよい（外部への送信ではない）

### お寺との共有（`sharing: true` のアプリだけ）

```tsx
"use client";
import { useAppSharing } from "@/apps-sdk";

export function SharingPanel() {
  const { available, shared, share, unshare, pending, error } = useAppSharing();
  // share() / unshare(): 成功すると true、失敗すると false（error に理由）。帯の表示も同時に変わる
}
```

- 文言やデザインは自由（例: 「住職に見てもらう」「見せるのをやめる」）。ひな形の `SharingPanel.tsx` が例
- **オンにする前に、何が共有されるかを説明する**（上のルール 5）。変更は、基盤が履歴と監査ログに残す

### AI（manifest に `ai` を書いたアプリだけ）

`ai.ts` に「AI の仕事」を宣言する。リクエストは基盤が組み立て、基盤のサーバーが Claude を呼ぶ（キーはアプリに渡らない）。

```ts
// ai.ts（import できるのは zod と @/apps-sdk だけ）
import { z } from "zod";
import { defineAppAI } from "@/apps-sdk";

export const ai = defineAppAI({
  tailor: {
    instructions: `あなたは日記アプリの仕立て屋です。日記から、その日の気持ちを服にします。…（固定の文。利用者の入力を混ぜない）`,
    output: z.object({
      emotion: z.enum(["joy", "sad", "anger", "anxiety", "tired", "calm", "positive"]), // 選択肢は API が守る
      intensity: z.number().min(0).max(1),   // 範囲や長さは、基盤があとで確かめる
      name: z.string().max(20),
      tags: z.array(z.enum(["仕事", "家族", "自分"])).max(3),
    }),
    maxTextChars: 2000, // 受け付ける文字（初期値 4,000、最大 20,000）
    maxImages: 1,       // 受け付ける画像（初期値 0、最大 4）
    effort: "low",      // 考える深さ: low（初期値）/ medium / high
  },
});
```

```tsx
// App.tsx
"use client";
import { useAppAI, type AppProps } from "@/apps-sdk";
import type { ai } from "./ai"; // 型だけを使う（ai.ts の中身は画面に入らない）

export default function App({ manifest }: AppProps) {
  const { run, pending, consented } = useAppAI<typeof ai>();
  async function tailor(text: string, photo?: Blob) {
    const r = await run("tailor", { text, images: photo ? [photo] : [] });
    if (r.ok) {
      // r.data は ai.ts の output の型（{ emotion, intensity, name, tags }）
    } else {
      // r.kind: needs_consent / limit / refusal / unavailable / invalid_output / invalid_input
      // r.message: 利用者に見せてよい文。どれでも止まらないようにする（例: 辞書で選ぶ、定型文を使う）
    }
  }
}
```

- 初めて `run()` を呼ぶと、基盤が**同意の画面**を出す（何を、何のために、Anthropic 社の Claude に送るか。manifest の `ai.purpose` と `ai.sends` から作る）。同意しないと `needs_consent` が返る。先に聞きたいときは `requestConsent()` を呼ぶ
- 画像は `Blob`（`<input type="file">` の `File` など）を渡す。SDK が長辺 1568px の JPEG に縮めてから送る
- 返事の形は `output`（zod の `z.object`）。`z.record`、`transform`、キーの決まっていないオブジェクトは使えない（`apps:check` が知らせる）
- **回数と費用には上限がある**（利用者ごとの 1 日の回数、アプリの月の費用）。上限に達すると `limit` が返る。AI がなくても使える作りにする
- 同じ日に何度も呼ばせない、入力が空なら呼ばない、など、むだな呼び出しを減らす

### 素材

```tsx
"use client";
import { useAppAssets } from "@/apps-sdk";

const assets = useAppAssets();
<img src={assets.url("img/door.webp")} alt="" />;                // 画面で使う
const href = await assets.dataUrl("img/shape_coat.webp");       // PNG に書き出すとき（SVG に埋め込むなど）
```

- `assets/` に置けるのは PNG、JPEG、WebP、GIF、AVIF、MP3、M4A、OGG、WAV、WOFF2。**SVG は置けない**（SVG の絵はコンポーネントの中に `<svg>` で書く）
- 1 ファイル 2 MB まで、1 アプリ 30 MB まで。画面に出す大きさに縮めておく
- CSS の `url()` で使うときは、`style={{ backgroundImage: \`url(${assets.url("img/bg.webp")})\` }}` のように、コンポーネントの中で渡す
- SVG を PNG に書き出すときの `xmlns="http://www.w3.org/2000/svg"` と `xmlns:xlink="http://www.w3.org/1999/xlink"` は、外部の URL の決まりから外してある（通信はしないため）

### 端末の機能

使ってよい: 音声入力（`SpeechRecognition` / `webkitSpeechRecognition`。使えない端末ではボタンを出さない）、写真の選択（`<input type="file" accept="image/*">`）、振動（`navigator.vibrate`。iPhone では効かない）、音（`AudioContext`、`assets/` の音）、`<canvas>` での画像の作成、画像の保存（`<a download>`）、端末の共有機能（`navigator.share`）。
端末の共有機能は、**利用者が自分で押したときだけ**にする（自動で送らない）。

### 見た目
- アプリ専用の CSS は `*.module.css`（CSS Modules）に書き、`import styles from "./App.module.css"` で使う。ほかの画面に影響する CSS（全体の `.css`、`:global`、`@import`）は使えない
- 水彩のにじみなどの SVG のフィルターは、アプリのコンポーネントの中の `<svg><defs>` に書く（`id` はアプリの名前を前に付けて、ほかと重ならないようにする）
- 型: `AppManifest`、`AppDocument<T>`、`AppProps`、`AppAdminProps<T>`、`AppStorage<T>`、`AppSharing`、`AppAI`、`AppAIResult<T>`、`AppAssets`

## データの形を変えるとき
すでに保存された文書は、古い形のまま残る。形を変えるときは、data に版（`v: 2` など）を入れ、古い形も読めるように書く。

## 書き方の注意
- 利用者は高齢の方も多い（お寺の画面の中に出すとき）。やさしい言葉で、文字は大きめ、ボタンは押しやすく。スマートフォンで見やすくする（全画面のアプリは、アプリの利用者に合わせてよい）
- 消す操作の前には確認を出す（`confirm` など）
- グラフや装飾は、ライブラリを使わず `div`、`<svg>`、Tailwind、CSS Modules で作る
- Admin.tsx には、利用者が保存した内容だけを表示する（推測や評価を足さない）

## 確かめ方
1. `npm run apps:gen`（一覧を作り直し、素材を配信の場所に写す。`npm run dev` を起動したときにも流れる。起動中にアプリを足したときは、手で流す）
2. `npm run apps:check`（規約違反が 0 件）
3. `npm run typecheck` と `npm run lint`
4. `npm run dev` で `/apps` を開き、ニックネームで始めて、作る・直す・消すを試す
5. `sharing: true` なら、共有し、帯（全画面では右上のボタン）の表示が変わること、管理画面（`/admin/apps`）で Admin.tsx の表示を確かめる。共有をやめると見えなくなることも確かめる
6. AI を使うなら、同意の画面が出ること、同意しないときと AI が失敗したときもアプリが止まらないことを確かめる

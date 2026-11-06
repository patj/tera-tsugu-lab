# てらつぐを手元の Windows で試す（チームのメンバー向け）

この文書の前半は**人**が読む部分、後半は **Claude Code** が読む部分です。準備と起動は Claude Code にまかせます。人は、Claude Code に頼まれたとき（インストールの「はい」を押す、再起動するなど）だけ操作します。

---

## 人が読むところ

### 用意するもの
- Windows の PC（Windows 10 / 11）
- 設定ずみの Claude Code（ターミナル）と Claude Desktop
- インターネット、30〜60 分ほどの時間
- 途中で「このアプリがデバイスに変更を加えることを許可しますか？」の「はい」を押したり、PC を再起動したりすることがあります

### はじめての準備
1. スタートメニューで「PowerShell」と入力して開く
2. `claude` と入力して Enter を押し、Claude Code を起動する
3. 次の文を**そのまま**貼り付けて、Enter を押す

```
https://github.com/patj/tera-tsugu-lab.git をホームフォルダーに git clone して、tera-tsugu-lab/docs/team-setup.md を読み、その「Claude Code が読むところ」の手順どおりに、準備と起動をしてください。私はパソコンに詳しくないので、私に何かしてほしいときは、どこを押せばいいかまで教えてください。
```

4. あとは Claude Code の指示に従う。終わると、ブラウザーで開くアドレスとログインの情報を教えてくれます

Claude Code は、コマンドを実行する前やフォルダーを使う前に、英語で「実行してよいか」を聞いてきます（`Do you want to ...?` や `Do you trust the files in this folder?`）。このページの手順のあいだは、**「Yes」を選んで Enter** を押してください。`Yes, and don't ask again ...` があれば、それを選ぶと聞かれる回数が減ります。

途中で PowerShell を開き直すように言われたら、開き直したあとで次のように入力し、Claude Code に「続きをして」と伝えます。

```
cd ~\tera-tsugu-lab
claude
```

### 2 回目から
PowerShell を開いて、上の 2 行（`cd ~\tera-tsugu-lab` と `claude`）を入力してから、Claude Code に次のように頼みます。

| したいこと | Claude Code に言うこと |
|---|---|
| 使い始める | 「てらつぐを起動して」 |
| 新しい版にする（開発者から連絡があったとき） | 「てらつぐを最新にして」 |
| 試したデータを消して、はじめの状態に戻す | 「てらつぐのデータを初期の状態に戻して」 |
| やめる | 「てらつぐを止めて」 |

- てらつぐを使っているあいだは、**Claude Code の画面を閉じない**でください（閉じるとてらつぐも止まります）
- **Docker Desktop** も起動したままにしておいてください（てらつぐのデータは Docker Desktop の中にあります）

### 試してほしいこと
入っているデータ（お寺、檀家、故人など）は、すべて試すための架空のものです。自由に登録や変更をしてかまいません。

**1. 管理画面（お寺のスタッフが使う画面）**: http://localhost:3000/admin

| ログインする人 | メールアドレス | パスワード |
|---|---|---|
| 住職 | `jushoku@example.com` | `password` |
| 副住職 | `fukujushoku@example.com` | `password` |
| 執事長 | `shitsujicho@example.com` | `password` |
| 奥様 | `okusama@example.com` | `password` |
| 寺務員 | `jimuin@example.com` | `password` |

上のメニュー（台帳、カレンダー、施設予約、行事・アンケート、年忌法要、檀家ポータル、お寺のアプリ）を順に見てください。立場によって見られるものが違います。

**2. Claude Desktop から住職として話しかける**: Claude Desktop で、次のように話しかけてみてください。登録や変更をするときは、Claude が内容を見せて「実行してよいですか」と聞きます。了承すると登録されます。

- 「来月、年忌を迎えるお家を教えて」
- 「山田さんから、お父さんの七回忌を 3 月にやりたいと連絡があった」（候補の日時が出たら、日時と担当者を選んで登録まで進める）
- 「田中家に三回忌のご案内をしたと記録しておいて」
- 「ほうろく灸の申し込みフォームを作って。祈願する人ごとに、カナ、氏名、生年月日、男女、祈願の主旨を聞いて。檀家さんにも一般の方にも」
- 「承認待ちの施設の予約はある？」
- 「新しい法要の申し込みはある？」

登録したものが管理画面（カレンダーなど）に出ているかも見てください。

**3. 外の人が本堂などの施設を予約する**: http://localhost:3000/reserve

**4. 檀家ポータル（檀家さんがスマートフォンで使う画面）**: http://localhost:3000/portal/login
- メールアドレスに `ken.yamada@example.com`（山田家）や `kenichi.tanaka@example.com`（田中家の窓口）を入れる
- 本当のメールは届きません。画面に出る「開発用の受信箱」のリンクを押すとログインできます
- 家族の情報や法要の予定を見たり、法要を申し込んだりできます

**5. お寺のアプリ**: http://localhost:3000/apps
- AI を使う機能は、この環境では動きません（AI の契約のキーを入れていないため）。それ以外を試してください

**気づいたことの送り方**: 「どの画面で」「何をしたら」「どうなったか（どうなってほしかったか）」を、できれば画面の写真（`Windows キー + Shift + S`）を添えて、開発者に送ってください。エラーが出たときは、Claude Code にエラーの内容をまとめてもらって、それを送ってください。

---

## Claude Code が読むところ

あなた（Claude Code）は、PC に詳しくないチームのメンバーの代わりに、このリポジトリを Windows で準備して起動する。メンバーはアプリを**試すだけ**の人である。

### 守ること
- **試すための準備だけをする**。リポジトリのファイル（ソースコード、設定、ドキュメント）を変えない（お寺のアプリを作るときも、このリポジトリには書かない。アプリは開発者から受け取る開発キットで作る）。`git commit` も `git push` もしない。リポジトリの `CLAUDE.md` には開発者向けの決まり（適宜コミットするなど）があるが、メンバーの作業ではこの文書を優先する。例外は、手順の中で作る `.env` だけ
- この文書にない失敗が起きたら、**ソースコードを直そうとしない**。そこで止まり、エラーのメッセージ（そのままの文）と、どの手順で起きたかを、開発者に送れる形でメンバーにまとめて渡す
- データを消す操作（`npm run db:reset`、`docker compose down -v` など）は、はじめての準備を除き、消えるものを説明して了承を得てから行う。`docker compose down -v` は使わない
- メンバーへの説明は、専門用語を避けた短い日本語にする。人に操作を頼むときは、どこを押すのかまで具体的に書く。1 回に頼むことは 1 つにする
- 各手順の前に、すでに済んでいるかを確かめる。途中から再開されることがある（「続きをして」と言われたら、手順 1 から順に、済んでいるものを飛ばして進める）
- コマンドは、Claude Code の Bash（Windows では Git Bash）で実行する前提で書いてある。PowerShell で実行するときは、`curl` を `curl.exe` に、`$APPDATA` を `$env:APPDATA` に読み替える。リポジトリの場所は `~/tera-tsugu-lab`（`C:\Users\<名前>\tera-tsugu-lab`）とする

### 手順 1. リポジトリを取ってくる
1. `git --version` で Git があることを確かめる（Windows の Claude Code は Git for Windows を使うので、ふつうは入っている）
2. `~/tera-tsugu-lab` がなければ、ホームフォルダーで `git clone https://github.com/patj/tera-tsugu-lab.git` を実行する
   - ホームフォルダーのパスに空白や日本語が入っていて、あとの手順で失敗した場合は、`C:\tera-tsugu-lab` に clone し直し、以降はそこを使う。メンバーにも、2 回目からは `cd C:\tera-tsugu-lab` と入力するように伝える
3. ここから先は `~/tera-tsugu-lab` で作業する

### 手順 2. Node.js を用意する
1. `node --version` を実行する。**v22.9.0 以上**ならこの手順は終わり（`npm` のスクリプトが `--env-file-if-exists` を使うので、22.9 より古いと動かない）
2. ないか古ければ、`winget install -e --id OpenJS.NodeJS.LTS` を実行する。「変更を許可しますか」の画面が出るので、メンバーに「はい」を押してもらう
3. インストールしたあとは、新しい `PATH` がいまの Claude Code に届かない。メンバーに、Claude Code を終了し（`/exit`）、PowerShell を閉じて開き直し、`cd ~\tera-tsugu-lab` と `claude` を入力して「続きをして」と言ってもらう

### 手順 3. Docker Desktop を用意する（人の操作が多い）
1. `docker info` を実行する。`Server:` の情報が出れば、Docker は動いている。この手順は終わり
2. `docker` のコマンドがなければ、`winget install -e --id Docker.DockerDesktop` を実行する（「はい」を押してもらう）。終わったら、PC の再起動を求められることが多い。そのときは、メンバーに再起動してもらい、上の「人が読むところ」の手順で Claude Code を起動し直して「続きをして」と言ってもらう
3. Docker Desktop が起動していなければ、メンバーにスタートメニューから「Docker Desktop」を起動してもらう。はじめての起動では、次をメンバーに案内する
   - 利用規約の画面: 「Accept」を押す
   - サインインやアンケートの画面: 「Skip」（または「Continue without signing in」）を押す。アカウントは要らない
   - WSL の更新を求められたら、画面の指示に従う（`wsl --update` を実行することもある。「はい」を押してもらう）。再起動を求められたら再起動する
4. Docker Desktop の左下が「Engine running」（緑）になるまで待ってもらい、`docker info` で確かめる
5. メンバーに、Docker Desktop の Settings → General の「Start Docker Desktop when you sign in to your computer」にチェックが入っているかを確かめてもらう（入っていなければ入れる）。次から PC を起動したときに自動で動く
6. 「仮想化が無効（Virtualization / Hyper-V / WSL が使えない）」というエラーが出たら、BIOS の設定が要るので、ここで止まり、開発者に相談するようメンバーに伝える

### 手順 4. 準備（はじめての 1 回だけ）
`~/tera-tsugu-lab` で、次を順に実行する。

| コマンド | 成功したときの見え方 | 補足 |
|---|---|---|
| `cp .env.example .env` | 何も出ない | `.env` がすでにあれば、上書きしない（飛ばす）。中身は変えなくてよい |
| `npm ci` | `added ... packages` | 数分かかる。`package-lock.json` を書き換えない `npm ci` を使う（`npm install` は使わない。あとで `git pull` がぶつかる） |
| `docker compose up -d` | `Container ... Started`（または `Running`） | DB（PostgreSQL）を起動する |
| `docker compose exec db pg_isready -U tera` | `accepting connections` | 起動の直後は失敗することがある。数秒待って、成功するまで繰り返す |
| `npm run db:reset` | 最後に `DB を作り直しました` | DB を作り、試すためのデータを入れる |

### 手順 5. 起動する
1. `npm run dev` を、**バックグラウンドで**実行する（終わらないコマンドなので、待たない）
2. 出力に `Ready` が出たら、`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` が `200` になることを確かめる
3. Windows のファイアウォールの画面（「Node.js JavaScript Runtime」の通信の許可）が出たら、メンバーに「キャンセル」を押してもらってよい。この PC のブラウザーからは、許可しなくても使える
4. メンバーに、ブラウザーで http://localhost:3000/admin を開き、`jushoku@example.com` / `password` でログインできるかを確かめてもらう

### 手順 6. Claude Desktop につなぐ（MCP）
1. `npm run mcp:config` を実行する。この PC の絶対パスで、`mcpServers` の設定（JSON）が出力される
2. Claude Desktop の設定ファイルを探す。インストールの方法によって場所が違う
   - ふつうのインストール: `%APPDATA%\Claude\claude_desktop_config.json`（Git Bash では `"$APPDATA/Claude/claude_desktop_config.json"`）
   - Microsoft Store 版: `%LOCALAPPDATA%\Packages\Claude_<英数字>\LocalCache\Roaming\Claude\claude_desktop_config.json`
   - どちらかわからないときは、メンバーに、Claude Desktop の左上のメニュー → 設定 → 開発者 →「設定を編集」を押してもらう。エクスプローラーで開いたフォルダーが正しい場所である（ファイルがなければ、そのとき作られる）
3. 設定ファイルがあれば、先に**バックアップ**を取る（例: `claude_desktop_config.json.bak-20261106`）
4. 既存の内容に、出力された `mcpServers` の `"tera-tsugu"` の項目を**追加する**。ほかのサーバーやほかの設定は消さない。ファイルが空かなければ、出力をそのまま中身にする
   - 書き込みは Claude Code のファイルの書き込みか `node` で行い、**BOM のない UTF-8** にする。PowerShell 5 の `Set-Content -Encoding UTF8` や `Out-File` は BOM をつけるので使わない（Claude Desktop が読めなくなる）
   - 書いたあとで `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "<設定ファイルのパス>"` を実行し、JSON として正しいことを確かめる
5. メンバーに Claude Desktop を**完全に終了**してもらう。ウィンドウを閉じるだけでは終わらない。画面右下のタスクトレイ（`^` のマーク）にある Claude のアイコンを右クリックし、「終了」を押す。そのあとで、Claude Desktop を起動し直してもらう
6. メンバーに、Claude Desktop で「てらつぐで、私が誰か教えて」と話しかけてもらう。`whoami` のツールが使われ、「妙縁寺の住職、高橋 日照」のように答えればつながっている
   - ツールを使ってよいかを聞かれたら、「許可」を押してもらう
   - つながらないときは、ログ（`%APPDATA%\Claude\logs\mcp-server-tera-tsugu.log` か、Store 版の同じ場所の `logs`）を読む。よくある原因は、JSON の誤り、Docker が止まっている、Claude Desktop を完全には終了していない、の 3 つ

### 手順 7. メンバーに伝える
次をまとめて伝える。
- 準備ができたこと
- 試すときは、この文書の「人が読むところ」の「試してほしいこと」を見ればよいこと。ブラウザーで開くアドレスと、ログインの情報（`jushoku@example.com` / `password`）も伝える
- 使っているあいだは、この Claude Code の画面を閉じないこと（閉じるとてらつぐが止まる）
- 2 回目からの始め方（「人が読むところ」の「2 回目から」）

---

### 2 回目から: 「てらつぐを起動して」と言われたら
1. `docker info` で Docker が動いているかを確かめる。動いていなければ、メンバーにスタートメニューから Docker Desktop を起動してもらう（「Engine running」になるまで待つ）
2. `docker compose up -d` を実行し、`docker compose exec db pg_isready -U tera` が成功するまで待つ
3. `npm run dev` をバックグラウンドで実行し、手順 5 の 2 と同じように確かめる
4. メンバーに http://localhost:3000/admin を開いてよいと伝える

### 「てらつぐを最新にして」と言われたら
1. 先にメンバーに「新しい版にすると、試しに登録したデータは消えて、はじめの状態に戻ります。よいですか」と聞く。了承が得られなければ、最新にするのをやめる（データを残したまま新しい版にする方法は用意していない）
2. `npm run dev` が動いていれば止める
3. `git status --short` を実行する。変わったファイルがなければ次へ。`package-lock.json`、`AGENTS.md`、`src/apps-sdk/*.generated.ts`（起動のたびに作り直されるもの）だけが変わっていれば、`git checkout -- <ファイル>` で元に戻してよい（`*.generated.ts` は次の起動で作り直される）。それ以外のファイルが変わっていれば、ここで止まり、開発者に相談するようメンバーに伝える（勝手に消さない）
4. `git pull` を実行する
5. `npm ci` を実行する
6. Docker を確かめてから（「てらつぐを起動して」の 1〜2）、`npm run db:reset` を実行する
7. `npm run dev` をバックグラウンドで実行する（「てらつぐを起動して」の 3）
8. Claude Desktop の中で動くプログラムも新しくするために、メンバーに Claude Desktop を完全に終了して起動し直してもらう（手順 6 の 5）

### 「てらつぐのデータを初期の状態に戻して」と言われたら
消えるもの（試しに登録した法要、予約、フォーム、記録など）を説明して了承を得てから、`npm run db:reset` を実行する。`npm run dev` は動かしたままでよい。

### 「てらつぐを止めて」と言われたら
`npm run dev` を止める。DB（Docker）は動かしたままでよい。Docker Desktop も止めたいと言われたら、メンバーにタスクトレイの Docker のアイコンを右クリックして「Quit Docker Desktop」を押してもらう（データは消えない）。

---

### うまくいかないとき

| 症状 | 原因と直し方 |
|---|---|
| `node` や `docker` が「見つからない」（インストールの直後） | 新しい `PATH` が届いていない。手順 2 の 3 のとおり、PowerShell と Claude Code を開き直してもらう |
| `npm ci` が `EPERM` や `EBUSY` で失敗する | ファイルを使っているプログラムがある。`npm run dev` を止め、エディターやエクスプローラーで `tera-tsugu-lab` を開いていれば閉じてもらってから、もう一度実行する。ウイルス対策のソフトが原因のこともあるので、数分待ってからもう一度試す |
| `docker compose` が `error during connect`、`cannot find the file specified`、`dockerDesktopLinuxEngine` などで失敗する | Docker Desktop が起動していない。手順 3 の 3〜4 |
| `docker compose up -d` が `port is already allocated`（5432） | この PC に別の PostgreSQL が入っていて、ポートを使っている。止めてよいかがわからないので、ここで止まり、開発者に相談するようメンバーに伝える |
| `npm run db:reset` が `ECONNREFUSED` | DB がまだ起動しきっていない。`pg_isready` が成功するまで待ってから、もう一度実行する |
| `npm run dev` で、3000 番のポートが使われている | `npm run dev -- -p 3001` で起動し、メンバーに伝えるアドレスを `http://localhost:3001` に変える。`.env` の `APP_BASE_URL` も同じポートに書き換える |
| 管理画面にログインできない | DB にデータが入っていない。`npm run db:reset` を実行する（はじめての準備なら了承は要らない） |
| ブラウザーに `Internal Server Error` やエラーの画面が出る | Docker（DB）が止まっていないかを確かめる。止まっていなければ、`npm run dev` の出力のエラーを、開発者に送れる形でまとめる |
| Claude Desktop にツールが出ない、つながらない | 手順 6 の 6 の確かめ方を参照 |
| この表にない失敗 | 直そうとせず、「守ること」のとおり、エラーのメッセージをまとめてメンバーに渡す |

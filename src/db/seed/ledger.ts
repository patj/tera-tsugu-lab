// 台帳（ledger）のシード: 世帯、個人と故人、家系図の関係、一般コンタクト、対応記録。
// 台本（spec.md §11）のためのデータは docs/tasks/01-ledger.md の「シードの名前」を参照。
//
// 名前（ctx.set）:
//   世帯: "household:<世帯>"（yamada、yamada_kita、tanaka、sato、suzuki、ito、watanabe、nakamura、kobayashi、kato、yoshida と、
//         自動で作る 19 世帯 takagi、matsumoto、…）
//   個人: "person:<世帯>:<役>"（役は世帯主から見た立場。例: person:yamada:head、person:yamada:father）
//   一般コンタクト: "contact:<名前>"
import { eq } from "drizzle-orm";
import { contactLogs, contacts, households, personRelations, persons } from "../schema";
import type { Seed, SeedContext } from "./context";

type SeedPerson = {
  role: string;
  family?: string;
  given: string;
  kana: string;
  gender: "male" | "female";
  relation: string;
  birth?: string;
  death?: string;
  homyo?: string;
  mobile?: string;
  email?: string;
  notes?: string;
};

type SeedHousehold = {
  key: string;
  name: string;
  kana: string;
  postalCode?: string;
  address: string;
  phone: string;
  /** お墓の場所（ほかの墓地のとき。境内の墓地なら省略） */
  graveAddress?: string;
  status?: "active" | "left" | "moved";
  joinedOn: string;
  head: string;
  /** 省略すると世帯主 */
  contact?: string;
  notes?: string;
  people: SeedPerson[];
  /** [子, 親] */
  parents?: [string, string][];
  spouses?: [string, string][];
};

/** 満年齢（享年として入れる） */
function ageAt(birth: string, death: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [dy, dm, dd] = death.split("-").map(Number);
  return dy - by - (dm < bm || (dm === bm && dd < bd) ? 1 : 0);
}

// ---- 台本のための世帯 ----

const SCENE_HOUSEHOLDS: SeedHousehold[] = [
  {
    // 場面 0、3: 父（2021 年没）の七回忌が 2027 年。祖母の十三回忌も 2027 年（複数霊位供養の提案）。祖父の三十七回忌が 2026 年 12 月（場面 1）
    key: "yamada",
    name: "山田家",
    kana: "やまだ",
    postalCode: "180-0001",
    address: "東京都武蔵野市本町 2-3-5",
    phone: "0422-55-0101",
    joinedOn: "1962-04-01",
    head: "head",
    people: [
      { role: "head", given: "健", kana: "やまだ けん", gender: "male", relation: "本人", birth: "1965-06-12", mobile: "090-5550-0101", email: "ken.yamada@example.com" },
      { role: "mother", given: "幸子", kana: "やまだ さちこ", gender: "female", relation: "母", birth: "1942-02-03" },
      { role: "wife", given: "由美", kana: "やまだ ゆみ", gender: "female", relation: "妻", birth: "1968-09-21", mobile: "090-5550-0102" },
      { role: "daughter", given: "さくら", kana: "やまだ さくら", gender: "female", relation: "長女", birth: "1995-04-02" },
      { role: "son", given: "翔太", kana: "やまだ しょうた", gender: "male", relation: "長男", birth: "1998-11-15" },
      { role: "father", given: "太郎", kana: "やまだ たろう", gender: "male", relation: "父", birth: "1938-05-10", death: "2021-03-24", homyo: "慈光院日太信士" },
      { role: "grandmother", given: "キヨ", kana: "やまだ きよ", gender: "female", relation: "祖母", birth: "1920-01-15", death: "2015-08-10", homyo: "妙香院日喜信女" },
      { role: "grandfather", given: "清", kana: "やまだ きよし", gender: "male", relation: "祖父", birth: "1912-07-01", death: "1990-12-05", homyo: "寿量院日清信士" },
    ],
    parents: [
      ["head", "father"],
      ["head", "mother"],
      ["daughter", "head"],
      ["daughter", "wife"],
      ["son", "head"],
      ["son", "wife"],
      ["father", "grandfather"],
      ["father", "grandmother"],
    ],
    spouses: [
      ["father", "mother"],
      ["head", "wife"],
      ["grandfather", "grandmother"],
    ],
  },
  {
    // 場面 0: 俗名が似た故人（山田 太一。続柄も「父」）がいる、別の山田家
    key: "yamada_kita",
    name: "山田家",
    kana: "やまだ",
    postalCode: "180-0012",
    address: "東京都武蔵野市北町 5-8-1",
    phone: "0422-55-0202",
    joinedOn: "1978-10-01",
    head: "head",
    people: [
      { role: "head", given: "修", kana: "やまだ おさむ", gender: "male", relation: "本人", birth: "1960-03-08" },
      { role: "wife", given: "恵子", kana: "やまだ けいこ", gender: "female", relation: "妻", birth: "1962-12-01" },
      { role: "father", given: "太一", kana: "やまだ たいち", gender: "male", relation: "父", birth: "1933-04-20", death: "2018-03-02", homyo: "慈雲院日一信士" },
    ],
    parents: [["head", "father"]],
    spouses: [["head", "wife"]],
  },
  {
    // 場面 2、5: 妻（2025 年没）の三回忌が 2027 年。窓口は長男（世帯主とは別）。親子と配偶者の関係が入っている
    key: "tanaka",
    name: "田中家",
    kana: "たなか",
    postalCode: "180-0004",
    address: "東京都武蔵野市栄町 1-4-12",
    phone: "0422-55-0303",
    joinedOn: "1955-05-01",
    head: "head",
    contact: "son",
    people: [
      { role: "head", given: "一郎", kana: "たなか いちろう", gender: "male", relation: "本人", birth: "1950-07-07" },
      { role: "son", given: "健一", kana: "たなか けんいち", gender: "male", relation: "長男", birth: "1978-05-20", mobile: "090-5550-0303", email: "kenichi.tanaka@example.com" },
      { role: "son_wife", given: "美咲", kana: "たなか みさき", gender: "female", relation: "長男の妻", birth: "1980-10-03", mobile: "090-5550-0304", email: "misaki.tanaka@example.com" },
      { role: "grandchild", given: "陽菜", kana: "たなか ひな", gender: "female", relation: "孫", birth: "2008-01-15" },
      { role: "wife", given: "和子", kana: "たなか かずこ", gender: "female", relation: "妻", birth: "1951-02-11", death: "2025-04-12", homyo: "蓮華院日和信女" },
      { role: "father", given: "正雄", kana: "たなか まさお", gender: "male", relation: "父", birth: "1921-06-30", death: "2009-09-03", homyo: "本行院日正信士" },
      { role: "mother", given: "ヨシ", kana: "たなか よし", gender: "female", relation: "母", birth: "1918-03-03", death: "1998-06-21", homyo: "常楽院日善信女" },
    ],
    parents: [
      ["son", "head"],
      ["son", "wife"],
      ["grandchild", "son"],
      ["grandchild", "son_wife"],
      ["head", "father"],
      ["head", "mother"],
    ],
    spouses: [
      ["head", "wife"],
      ["son", "son_wife"],
      ["father", "mother"],
    ],
  },
  {
    // 場面 1: 同じ世帯で 2026 年 12 月に 2 人（七回忌と三回忌）
    key: "sato",
    name: "佐藤家",
    kana: "さとう",
    address: "東京都武蔵野市緑町 3-1-7",
    phone: "0422-55-0404",
    joinedOn: "1970-01-01",
    head: "head",
    people: [
      { role: "head", given: "誠", kana: "さとう まこと", gender: "male", relation: "本人", birth: "1958-08-08" },
      { role: "wife", given: "洋子", kana: "さとう ようこ", gender: "female", relation: "妻", birth: "1960-05-05" },
      { role: "father", given: "茂", kana: "さとう しげる", gender: "male", relation: "父", birth: "1930-02-14", death: "2020-12-18", homyo: "法華院日茂信士" },
      { role: "mother", given: "キミ", kana: "さとう きみ", gender: "female", relation: "母", birth: "1933-10-10", death: "2024-12-28", homyo: "宝珠院日貴信女" },
    ],
    parents: [
      ["head", "father"],
      ["head", "mother"],
    ],
    spouses: [
      ["head", "wife"],
      ["father", "mother"],
    ],
  },
  {
    // 場面 1: 2026 年 12 月に一周忌
    key: "suzuki",
    name: "鈴木家",
    kana: "すずき",
    address: "東京都武蔵野市寺町 4-2-9",
    phone: "0422-55-0505",
    joinedOn: "1985-03-01",
    head: "head",
    people: [
      { role: "head", given: "浩", kana: "すずき ひろし", gender: "male", relation: "本人", birth: "1955-01-20" },
      { role: "mother", given: "ハナ", kana: "すずき はな", gender: "female", relation: "母", birth: "1929-04-08", death: "2025-12-02", homyo: "清涼院日華信女" },
    ],
    parents: [["head", "mother"]],
  },
  {
    // 場面 1: 2026 年 12 月に十三回忌
    key: "ito",
    name: "伊藤家",
    kana: "いとう",
    address: "東京都武蔵野市桜台 2-6-3",
    phone: "0422-55-0606",
    joinedOn: "1990-07-01",
    head: "head",
    people: [
      { role: "head", given: "直樹", kana: "いとう なおき", gender: "male", relation: "本人", birth: "1970-09-09" },
      { role: "wife", given: "裕子", kana: "いとう ゆうこ", gender: "female", relation: "妻", birth: "1972-02-22" },
      { role: "father", given: "勝", kana: "いとう まさる", gender: "male", relation: "父", birth: "1940-11-11", death: "2014-12-20", homyo: "慧光院日勝信士" },
    ],
    parents: [["head", "father"]],
    spouses: [["head", "wife"]],
  },
  {
    // 場面 1: 2026 年 12 月に三十三回忌
    key: "watanabe",
    name: "渡辺家",
    kana: "わたなべ",
    address: "東京都武蔵野市若葉台 1-1-1",
    phone: "0422-55-0707",
    // お墓は境内ではなく、府中の霊園にある（墓前の法要の場所の初期値。spec.md §2）
    graveAddress: "東京都府中市多磨町 4-628-2",
    joinedOn: "1960-01-01",
    head: "head",
    people: [
      { role: "head", given: "和夫", kana: "わたなべ かずお", gender: "male", relation: "本人", birth: "1948-12-24" },
      { role: "mother", given: "トメ", kana: "わたなべ とめ", gender: "female", relation: "母", birth: "1915-08-15", death: "1994-12-11", homyo: "正覚院日留信女" },
    ],
    parents: [["head", "mother"]],
  },
  {
    // 期間の境目の確認: 2026-11-30 に七回忌（12 月には入らない）
    key: "nakamura",
    name: "中村家",
    kana: "なかむら",
    address: "東京都武蔵野市旭町 3-3-3",
    phone: "0422-55-0808",
    joinedOn: "1975-06-01",
    head: "head",
    people: [
      { role: "head", given: "勇", kana: "なかむら いさむ", gender: "male", relation: "本人", birth: "1952-04-04" },
      { role: "father", given: "次郎", kana: "なかむら じろう", gender: "male", relation: "父", birth: "1925-05-05", death: "2020-11-30", homyo: "円明院日次信士" },
    ],
    parents: [["head", "father"]],
  },
  {
    // 期間の境目の確認: 2027-01-03 に十三回忌（年をまたぐ期間の確認に使う）
    key: "kobayashi",
    name: "小林家",
    kana: "こばやし",
    address: "東京都武蔵野市末広町 6-2-4",
    phone: "0422-55-0909",
    joinedOn: "1982-09-01",
    head: "head",
    people: [
      { role: "head", given: "博", kana: "こばやし ひろし", gender: "male", relation: "本人", birth: "1957-07-17" },
      { role: "mother", given: "フミ", kana: "こばやし ふみ", gender: "female", relation: "母", birth: "1928-01-01", death: "2015-01-03", homyo: "守善院日文信女" },
    ],
    parents: [["head", "mother"]],
  },
  {
    // 離檀した世帯。2026 年 12 月に七回忌にあたる故人がいるが、年忌の一覧には出さない
    key: "kato",
    name: "加藤家",
    kana: "かとう",
    address: "神奈川県横浜市港北区港町 2-2-2",
    phone: "045-555-1010",
    status: "left",
    joinedOn: "1988-04-01",
    head: "head",
    notes: "2023 年に墓じまいをして離檀",
    people: [
      { role: "head", given: "実", kana: "かとう みのる", gender: "male", relation: "本人", birth: "1950-10-10" },
      { role: "father", given: "正", kana: "かとう ただし", gender: "male", relation: "父", birth: "1922-03-03", death: "2020-12-10", homyo: "寂静院日正信士" },
    ],
    parents: [["head", "father"]],
  },
  {
    // 2026 年 12 月が祥月命日だが、年忌の年ではない（八回忌）
    key: "yoshida",
    name: "吉田家",
    kana: "よしだ",
    address: "東京都武蔵野市富士見町 4-4-4",
    phone: "0422-55-1111",
    joinedOn: "1999-01-01",
    head: "head",
    people: [
      { role: "head", given: "大輔", kana: "よしだ だいすけ", gender: "male", relation: "本人", birth: "1975-03-30" },
      { role: "father", given: "弘", kana: "よしだ ひろむ", gender: "male", relation: "父", birth: "1944-06-06", death: "2019-12-15", homyo: "光照院日弘信士" },
    ],
    parents: [["head", "father"]],
  },
];

// ---- 自動で作る世帯（決まった乱数で、毎回同じものを作る） ----

/** [漢字, かな, ローマ字]。山田・田中は台本の検索が 1 つに決まるように使わない */
const FAMILY_NAMES: [string, string, string][] = [
  ["高木", "たかぎ", "takagi"],
  ["松本", "まつもと", "matsumoto"],
  ["井上", "いのうえ", "inoue"],
  ["木村", "きむら", "kimura"],
  ["林", "はやし", "hayashi"],
  ["清水", "しみず", "shimizu"],
  ["山口", "やまぐち", "yamaguchi"],
  ["森", "もり", "mori"],
  ["池田", "いけだ", "ikeda"],
  ["橋本", "はしもと", "hashimoto"],
  ["阿部", "あべ", "abe"],
  ["石川", "いしかわ", "ishikawa"],
  ["前田", "まえだ", "maeda"],
  ["藤井", "ふじい", "fujii"],
  ["後藤", "ごとう", "goto"],
  ["岡本", "おかもと", "okamoto"],
  ["長谷川", "はせがわ", "hasegawa"],
  ["村上", "むらかみ", "murakami"],
  ["近藤", "こんどう", "kondo"],
];

const TOWNS = ["本町", "東町", "西久保", "境南町", "関前", "御殿山", "中央", "吉祥寺東町", "八幡町", "緑町"];

const LIVING_MALE: [string, string][] = [
  ["浩二", "こうじ"], ["隆之", "たかゆき"], ["健太", "けんた"], ["拓也", "たくや"], ["雅人", "まさと"],
  ["哲也", "てつや"], ["秀樹", "ひでき"], ["聡", "さとし"], ["康弘", "やすひろ"], ["俊介", "しゅんすけ"],
];
const LIVING_FEMALE: [string, string][] = [
  ["恵美", "えみ"], ["真由美", "まゆみ"], ["彩", "あや"], ["美穂", "みほ"], ["智子", "ともこ"],
  ["直美", "なおみ"], ["久美子", "くみこ"], ["香織", "かおり"], ["由紀", "ゆき"], ["明子", "あきこ"],
];
const DECEASED_MALE: [string, string][] = [
  ["勇", "いさむ"], ["正一", "しょういち"], ["清治", "せいじ"], ["武", "たけし"], ["実", "みのる"],
  ["昭", "あきら"], ["進", "すすむ"], ["豊", "ゆたか"], ["義男", "よしお"], ["三郎", "さぶろう"],
];
const DECEASED_FEMALE: [string, string][] = [
  ["ハル", "はる"], ["トミ", "とみ"], ["千代", "ちよ"], ["静江", "しずえ"], ["文子", "ふみこ"],
  ["春子", "はるこ"], ["節子", "せつこ"], ["久子", "ひさこ"], ["和代", "かずよ"], ["光子", "みつこ"],
];

/** 法号（〇〇院日〇信士 / 信女。spec.md §12 E-4）。台本の世帯の法号と重ならない院号にする */
const INGO = [
  "妙法", "大乗", "一乗", "妙音", "真如", "安住", "浄心", "春光", "秋月", "松寿",
  "梅香", "菊香", "永寿", "福寿", "徳善", "円成", "光明", "瑞雲", "慈恩", "本覚",
];
const DOGO = ["照", "信", "法", "妙", "蓮", "覚", "修", "明", "誠", "心", "道", "恵", "仁", "智", "徳"];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function generatedHouseholds(): SeedHousehold[] {
  const rand = mulberry32(20261109);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T,>(list: T[]) => list[int(0, list.length - 1)];
  // 12 月を避ける（場面 1 の「来月」の一覧を、台本の世帯だけにするため）
  const date = (yMin: number, yMax: number) => `${int(yMin, yMax)}-${pad(int(1, 11))}-${pad(int(1, 28))}`;
  let homyoIndex = 0;
  const homyo = (gender: "male" | "female") => {
    const i = homyoIndex++;
    return `${INGO[i % INGO.length]}院日${DOGO[(i * 7) % DOGO.length]}${gender === "male" ? "信士" : "信女"}`;
  };

  return FAMILY_NAMES.map(([family, kana, key], i) => {
    const headBirthYear = int(1945, 1978);
    const headMale = i % 4 !== 3;
    const [hg, hk] = pick(headMale ? LIVING_MALE : LIVING_FEMALE);
    const people: SeedPerson[] = [
      {
        role: "head",
        given: hg,
        kana: `${kana} ${hk}`,
        gender: headMale ? "male" : "female",
        relation: "本人",
        birth: `${headBirthYear}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
      },
    ];
    const parents: [string, string][] = [];
    const spouses: [string, string][] = [];
    if (headMale) {
      const [wg, wk] = pick(LIVING_FEMALE);
      people.push({ role: "wife", given: wg, kana: `${kana} ${wk}`, gender: "female", relation: "妻", birth: `${headBirthYear + int(0, 4)}-${pad(int(1, 12))}-${pad(int(1, 28))}` });
      spouses.push(["head", "wife"]);
      if (i % 2 === 0) {
        const [cg, ck] = pick(LIVING_MALE);
        people.push({ role: "child", given: cg, kana: `${kana} ${ck}`, gender: "male", relation: "長男", birth: `${headBirthYear + int(25, 32)}-${pad(int(1, 12))}-${pad(int(1, 28))}` });
        parents.push(["child", "head"], ["child", "wife"]);
      }
    }

    // 故人: 3 世帯に 1 つは 1 人、ほかは 2 人。5 世帯に 1 つは祖父も
    const deceasedCount = (i % 3 === 0 ? 1 : 2) + (i % 5 === 0 ? 1 : 0);
    const allRoles: { role: string; relation: string; gender: "male" | "female" }[] = [
      { role: "father", relation: "父", gender: "male" },
      { role: "mother", relation: "母", gender: "female" },
      { role: "grandfather", relation: "祖父", gender: "male" },
    ];
    const deceasedRoles = allRoles.slice(0, deceasedCount);
    for (const d of deceasedRoles) {
      const [g, gk] = pick(d.gender === "male" ? DECEASED_MALE : DECEASED_FEMALE);
      const death = d.role === "grandfather" ? date(1976, 1995) : date(1996, 2025);
      const birthYear = Number(death.slice(0, 4)) - int(68, 96);
      people.push({
        role: d.role,
        given: g,
        kana: `${kana} ${gk}`,
        gender: d.gender,
        relation: d.relation,
        birth: `${birthYear}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
        death,
        homyo: homyo(d.gender),
      });
      if (d.role !== "grandfather") parents.push(["head", d.role]);
    }
    if (deceasedRoles.some((d) => d.role === "mother")) spouses.push(["father", "mother"]);
    if (deceasedRoles.some((d) => d.role === "grandfather")) parents.push(["father", "grandfather"]);

    return {
      key,
      name: `${family}家`,
      kana,
      address: `東京都武蔵野市${TOWNS[i % TOWNS.length]} ${int(1, 6)}-${int(1, 20)}-${int(1, 15)}`,
      phone: `0422-55-${2000 + i * 7}`,
      status: i === FAMILY_NAMES.length - 1 ? "moved" : "active",
      joinedOn: `${int(1950, 2005)}-04-01`,
      head: "head",
      notes: i === FAMILY_NAMES.length - 1 ? "2024 年に県外へ転出" : undefined,
      people,
      parents,
      spouses,
    };
  });
}

const SEED_CONTACTS: { key: string; name: string; phone?: string; email?: string }[] = [
  { key: "contact:morikawa", name: "森川 美穂", phone: "080-5550-2001", email: "miho.morikawa@example.com" },
  { key: "contact:ogawa", name: "小川 宗和（茶道教室）", phone: "080-5550-2002" },
  { key: "contact:aoki", name: "青木 健（フォトスタジオ青木）", phone: "0422-55-3003", email: "studio@aoki-photo.example.com" },
  { key: "contact:nomura", name: "野村 明美", email: "akemi.nomura@example.com" },
];

async function insertHousehold(ctx: SeedContext, h: SeedHousehold): Promise<void> {
  const family = h.name.replace(/家$/, "");
  const [row] = await ctx.db
    .insert(households)
    .values({
      templeId: ctx.templeId,
      name: h.name,
      kana: h.kana,
      postalCode: h.postalCode ?? null,
      address: h.address,
      phone: h.phone,
      graveAddress: h.graveAddress ?? null,
      status: h.status ?? "active",
      joinedOn: h.joinedOn,
      notes: h.notes ?? null,
    })
    .returning({ id: households.id });
  ctx.set(`household:${h.key}`, row.id);

  const ids = new Map<string, string>();
  for (const p of h.people) {
    const [pr] = await ctx.db
      .insert(persons)
      .values({
        templeId: ctx.templeId,
        householdId: row.id,
        familyName: p.family ?? family,
        givenName: p.given,
        kana: p.kana,
        gender: p.gender,
        relation: p.relation,
        birthDate: p.birth ?? null,
        mobilePhone: p.mobile ?? null,
        email: p.email ?? null,
        isDeceased: Boolean(p.death),
        deathDate: p.death ?? null,
        homyo: p.homyo ?? null,
        ageAtDeath: p.death && p.birth ? ageAt(p.birth, p.death) : null,
        notes: p.notes ?? null,
      })
      .returning({ id: persons.id });
    ids.set(p.role, pr.id);
    ctx.set(`person:${h.key}:${p.role}`, pr.id);
  }

  const id = (role: string) => {
    const v = ids.get(role);
    if (!v) throw new Error(`シードの個人が見つかりません: ${h.key}:${role}`);
    return v;
  };
  await ctx.db
    .update(households)
    .set({ headPersonId: id(h.head), contactPersonId: id(h.contact ?? h.head) })
    .where(eq(households.id, row.id));

  const rels = [
    ...(h.parents ?? []).map(([c, p]) => ({ personId: id(c), relatedPersonId: id(p), kind: "parent" })),
    ...(h.spouses ?? []).map(([a, b]) => ({ personId: id(a), relatedPersonId: id(b), kind: "spouse" })),
  ];
  if (rels.length) await ctx.db.insert(personRelations).values(rels.map((r) => ({ templeId: ctx.templeId, ...r })));
}

export const ledgerSeed: Seed = {
  name: "ledger",
  async run(ctx) {
    for (const h of [...SCENE_HOUSEHOLDS, ...generatedHouseholds()]) await insertHousehold(ctx, h);

    for (const c of SEED_CONTACTS) {
      const [row] = await ctx.db
        .insert(contacts)
        .values({ templeId: ctx.templeId, name: c.name, phone: c.phone ?? null, email: c.email ?? null })
        .returning({ id: contacts.id });
      ctx.set(c.key, row.id);
    }

    const logs: { household: string; staff: string; kind: string; body: string; at: string }[] = [
      { household: "tanaka", staff: "jushoku", kind: "その他", body: "和子さんの一周忌の法要を本堂で営んだ。施主は一郎さん。ご家族 8 名", at: "2026-04-05T11:00:00+09:00" },
      { household: "tanaka", staff: "jimuin", kind: "電話", body: "健一さんから、今後の連絡は自分（健一）にしてほしいとの電話。窓口を健一さんに変更", at: "2026-06-10T15:30:00+09:00" },
      { household: "yamada", staff: "okusama", kind: "来寺", body: "お盆の棚経のお礼に、健さんと由美さんが来寺", at: "2026-08-20T10:15:00+09:00" },
      { household: "sato", staff: "jimuin", kind: "案内", body: "12 月の七回忌（茂さん）と三回忌（キミさん）の案内状を送付", at: "2026-10-01T14:00:00+09:00" },
      { household: "suzuki", staff: "fukujushoku", kind: "電話", body: "ハナさんの一周忌について、12 月の土曜で相談したいとの電話", at: "2026-10-15T09:40:00+09:00" },
    ];
    for (const l of logs) {
      await ctx.db.insert(contactLogs).values({
        templeId: ctx.templeId,
        householdId: ctx.get(`household:${l.household}`),
        staffId: ctx.get(`staff:${l.staff}`),
        kind: l.kind,
        body: l.body,
        createdAt: new Date(l.at),
      });
    }
  },
};

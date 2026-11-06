// 相談窓口（危機を検知したときと、ケアのポータルの全画面から案内する）。spec.md §7
// 出典: 厚生労働省「まもろうよ こころ」電話相談（https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/）
// 2026-11-06 に確かめた。番号と受付時間は変わることがあるので、公開の前に出典で確かめ直す。
export type CrisisResource = {
  name: string;
  /** 電話番号（表示用） */
  tel: string;
  /** tel: リンク用（数字だけ） */
  telHref: string;
  hours: string;
  note?: string;
};

export const CRISIS_RESOURCES_AS_OF = "2026-11-06";
export const CRISIS_RESOURCES_SOURCE = "https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/";

export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: "#いのちSOS",
    tel: "0120-061-338",
    telHref: "0120061338",
    hours: "24 時間・毎日",
    note: "無料",
  },
  {
    name: "よりそいホットライン",
    tel: "0120-279-338",
    telHref: "0120279338",
    hours: "24 時間",
    note: "無料（福島県からは 0120-279-226）",
  },
  {
    name: "いのちの電話",
    tel: "0120-783-556",
    telHref: "0120783556",
    hours: "毎日 16 時〜21 時（毎月 10 日は 8 時〜翌朝 8 時）",
    note: "無料。ナビダイヤル 0570-783-556 は 10 時〜22 時（通話料あり）",
  },
  {
    name: "こころの健康相談統一ダイヤル",
    tel: "0570-064-556",
    telHref: "0570064556",
    hours: "都道府県によって異なります",
    note: "お住まいの地域の公的な相談窓口につながります（通話料あり）",
  },
];

/** 命に危険がある、差し迫った場合 */
export const EMERGENCY_NOTE = "命に危険が迫っているときは、迷わず 119（救急）または 110（警察）に電話してください。";

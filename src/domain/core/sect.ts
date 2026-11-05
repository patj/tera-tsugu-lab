// 宗派プリセット（spec.md §2）。用語と年忌の一覧を宗派ごとに切り替える。
// 年忌の計算そのもの（何回忌か、など）は 01 台帳（src/domain/ledger/）が持つ。

export type SectPreset = {
  id: string;
  label: string;
  /** 戒名の呼び方（日蓮宗では「法号」） */
  posthumousNameLabel: string;
  /** 年忌法要を営む回忌の一覧（没年を 1 回忌として数える。一周忌は 2） */
  kaikiList: number[];
  /** 複数の年忌をあわせて営むことの、お寺の内部での呼び方 */
  jointServiceLabel: string;
  /** 同じことの、檀家さん向けの言い方（ポータルで使う） */
  jointServicePublicLabel: string;
};

export const SECT_PRESETS: Record<string, SectPreset> = {
  nichiren: {
    id: "nichiren",
    label: "日蓮宗",
    posthumousNameLabel: "法号",
    kaikiList: [2, 3, 7, 13, 17, 23, 27, 33, 37, 50],
    jointServiceLabel: "複数霊位供養",
    jointServicePublicLabel: "複数の故人をあわせて供養する",
  },
};

export function getSectPreset(sect: string): SectPreset {
  return SECT_PRESETS[sect] ?? SECT_PRESETS.nichiren;
}

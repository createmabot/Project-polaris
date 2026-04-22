export type HomeSectorMasterRow = {
  code: string;
  display_name: string;
  sort_order: number;
};

export const HOME_SECTOR_MASTER: HomeSectorMasterRow[] = [
  { code: 'TOPIX_TRANSPORT', display_name: '輸送用機器', sort_order: 10 },
  { code: 'TOPIX_ELECTRIC', display_name: '電気機器', sort_order: 20 },
  { code: 'TOPIX_BANKS', display_name: '銀行業', sort_order: 30 },
  { code: 'TOPIX_RETAIL', display_name: '小売業', sort_order: 40 },
  { code: 'TOPIX_INFO_TECH', display_name: '情報・通信業', sort_order: 50 },
];


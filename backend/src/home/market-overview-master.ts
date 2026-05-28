export type HomeMarketOverviewMasterRow = {
  code: string;
  display_name: string;
  sort_order: number;
};

export const HOME_INDEX_MASTER: HomeMarketOverviewMasterRow[] = [
  { code: 'NIKKEI_225', display_name: '日経平均', sort_order: 10 },
  { code: 'TOPIX', display_name: 'TOPIX', sort_order: 20 },
  { code: 'TSE_GROWTH_250', display_name: 'グロース250', sort_order: 30 },
  { code: 'SP500', display_name: 'S&P 500', sort_order: 40 },
  { code: 'NASDAQ', display_name: 'NASDAQ', sort_order: 50 },
  { code: 'DOW', display_name: 'NYダウ', sort_order: 60 },
];

export const HOME_FX_MASTER: HomeMarketOverviewMasterRow[] = [
  { code: 'USDJPY', display_name: 'USD/JPY', sort_order: 10 },
  { code: 'EURJPY', display_name: 'EUR/JPY', sort_order: 20 },
];

export const HOME_SECTOR_MASTER: HomeMarketOverviewMasterRow[] = [
  { code: 'TOPIX_TRANSPORT', display_name: '輸送用機器', sort_order: 10 },
  { code: 'TOPIX_ELECTRIC', display_name: '電気機器', sort_order: 20 },
  { code: 'TOPIX_BANKS', display_name: '銀行業', sort_order: 30 },
  { code: 'TOPIX_RETAIL', display_name: '小売業', sort_order: 40 },
  { code: 'TOPIX_INFO_TECH', display_name: '情報・通信業', sort_order: 50 },
];

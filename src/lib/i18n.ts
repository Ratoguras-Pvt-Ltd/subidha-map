import type { StockFilter, StockStatus } from "./stock";

/**
 * Public map/list only — admin stays English-only, so this is deliberately
 * separate from STATUS_PRESENTATION/FILTER_LABELS in stock.ts rather than adding
 * a language dimension to types the admin UI also consumes.
 */
export type Lang = "en" | "ne";

export const LANG_STORAGE_KEY = "subidha:lang";

type Dict = {
  status: Record<StockStatus, string>;
  filter: Record<StockFilter, string>;
  searchPlaceholder: string;
  clearSearch: string;
  allDistricts: string;
  nearMe: string;
  locating: string;
  nearestFirst: string;
  locationUnavailable: string;
  noGeolocation: string;
  resultCount: (visible: number, total: number) => string;
  cylindersToday: (n: number) => string;
  updated: string;
  call: string;
  directions: string;
  copy: string;
  addressCopied: string;
  copyFailed: string;
  noStockYetTitle: string;
  noStockYetBody: string;
  noMatchTitle: string;
  noMatchBody: string;
  resetSearch: string;
  mapEmptyTitle: string;
  mapEmptyNoDeliveries: string;
  mapEmptyNoMatch: string;
  bannerNoDeliveries: string;
  bannerResetsNightly: string;
  legendTitle: string;
  legendAvailable: string;
  legendLow: string;
  legendCritical: string;
};

const en: Dict = {
  status: {
    AVAILABLE: "Available",
    LOW_STOCK: "Low Stock",
    CRITICAL: "Critical",
    OUT_OF_STOCK: "Out of Stock",
  },
  filter: { ALL: "All", AVAILABLE: "Available", LOW: "Low Stock" },
  searchPlaceholder: "Search dealer, city or district…",
  clearSearch: "Clear search",
  allDistricts: "All districts",
  nearMe: "Near me",
  locating: "Locating…",
  nearestFirst: "Showing nearest dealers first",
  locationUnavailable: "Location unavailable. Search by area name instead.",
  noGeolocation: "Your browser can't share a location.",
  resultCount: (visible, total) =>
    visible === total
      ? `${visible} dealer${visible === 1 ? "" : "s"} with stock today`
      : `${visible} of ${total} with stock today`,
  cylindersToday: (n) => `${n === 1 ? "cylinder" : "cylinders"} delivered today`,
  updated: "Updated",
  call: "Call",
  directions: "Directions",
  copy: "Copy",
  addressCopied: "Address copied",
  copyFailed: "Could not copy — long-press the address to select it.",
  noStockYetTitle: "No cylinders available yet",
  noStockYetBody:
    "Today's deliveries have not been recorded. Counts reset at midnight, so check back later or call your usual dealer.",
  noMatchTitle: "No dealers match",
  noMatchBody: "Try a different area name or clear the filter.",
  resetSearch: "Reset search",
  mapEmptyTitle: "No cylinders available right now",
  mapEmptyNoDeliveries: "Today's deliveries have not been recorded yet. Browse the dealer list and call ahead.",
  mapEmptyNoMatch: "No dealer matches this search with stock in hand. Try a wider area.",
  bannerNoDeliveries:
    "Today's deliveries have not been recorded yet. Counts reset at midnight — please call the dealer to confirm before travelling.",
  bannerResetsNightly: "Figures show cylinders delivered today. Counts reset at midnight.",
  legendTitle: "Cylinders in stock today",
  legendAvailable: "More than 50",
  legendLow: "10 – 50",
  legendCritical: "Fewer than 10",
};

const ne: Dict = {
  status: {
    AVAILABLE: "उपलब्ध",
    LOW_STOCK: "थोरै मौज्दात",
    CRITICAL: "अति थोरै",
    OUT_OF_STOCK: "मौज्दात छैन",
  },
  filter: { ALL: "सबै", AVAILABLE: "उपलब्ध", LOW: "थोरै मौज्दात" },
  searchPlaceholder: "डिलर, सहर वा जिल्ला खोज्नुहोस्…",
  clearSearch: "खोज हटाउनुहोस्",
  allDistricts: "सबै जिल्ला",
  nearMe: "नजिकै",
  locating: "पत्ता लगाइँदै…",
  nearestFirst: "नजिकैका डिलरहरू पहिले देखाइँदै",
  locationUnavailable: "स्थान उपलब्ध छैन। क्षेत्रको नामले खोज्नुहोस्।",
  noGeolocation: "तपाईंको ब्राउजरले स्थान साझा गर्न सक्दैन।",
  resultCount: (visible, total) =>
    visible === total
      ? `आज मौज्दात भएका ${visible} डिलर`
      : `${total} मध्ये ${visible} मौज्दातमा`,
  cylindersToday: () => "आज डिलिवर भएको सिलिन्डर",
  updated: "अपडेट भयो",
  call: "कल गर्नुहोस्",
  directions: "दिशा",
  copy: "प्रतिलिपि",
  addressCopied: "ठेगाना प्रतिलिपि गरियो",
  copyFailed: "प्रतिलिपि गर्न सकिएन — ठेगाना चयन गर्न थिच्नुहोस्।",
  noStockYetTitle: "अहिलेसम्म सिलिन्डर उपलब्ध छैन",
  noStockYetBody:
    "आजको डिलिवरी अझै रेकर्ड गरिएको छैन। मध्यरातमा गणना रिसेट हुन्छ, पछि फेरि जाँच गर्नुहोस् वा आफ्नो सामान्य डिलरलाई कल गर्नुहोस्।",
  noMatchTitle: "कुनै डिलर मेल खाएन",
  noMatchBody: "फरक क्षेत्रको नाम प्रयास गर्नुहोस् वा फिल्टर हटाउनुहोस्।",
  resetSearch: "खोज रिसेट गर्नुहोस्",
  mapEmptyTitle: "अहिले सिलिन्डर उपलब्ध छैन",
  mapEmptyNoDeliveries: "आजको डिलिवरी अझै रेकर्ड गरिएको छैन। डिलर सूची हेर्नुहोस् र पहिले नै कल गर्नुहोस्।",
  mapEmptyNoMatch: "यो खोजसँग मेल खाने कुनै डिलरसँग मौज्दात छैन। फराकिलो क्षेत्र प्रयास गर्नुहोस्।",
  bannerNoDeliveries:
    "आजको डिलिवरी अझै रेकर्ड गरिएको छैन। गणना मध्यरातमा रिसेट हुन्छ — यात्रा गर्नुअघि डिलरलाई फोन गरी पुष्टि गर्नुहोस्।",
  bannerResetsNightly: "यी संख्याहरूले आज डिलिवर भएका सिलिन्डरहरू देखाउँछन्। गणना मध्यरातमा रिसेट हुन्छ।",
  legendTitle: "आज मौज्दातमा रहेका सिलिन्डर",
  legendAvailable: "५० भन्दा बढी",
  legendLow: "१०–५०",
  legendCritical: "१० भन्दा कम",
};

export const STRINGS: Record<Lang, Dict> = { en, ne };

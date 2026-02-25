export type Property = {
  id: number;
  title: string;
  area: string;
  address: string;
  price: number;
  sqm: number;
  lat: number;
  lng: number;
  createdAt: string;
  isOutlier?: boolean;
};

export type PropertyFilters = {
  minPrice?: number;
  maxPrice?: number;
  minSqm?: number;
  maxSqm?: number;
  area?: string;
};
